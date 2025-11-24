import dotenv from "dotenv";
import ExcelJS from "exceljs";
import axios from "axios";
import { User } from "../model/user.model.js";
import Jwt from "jsonwebtoken";
import { getUserHierarchyDetails } from "../rolePermission/RolePermission.js";
import { getUserWarehouseHierarchy } from "../rolePermission/permission.js";
import { Customer } from "../model/customer.model.js";
import transporterss from "../service/email.js";
import { Warehouse } from "../model/warehouse.model.js";
import { ruleCreation } from "../model/ruleCreation.model.js";
import { ApplyRule } from "../model/rule.applied.model.js";
import { UserDetail } from "../model/userDetails.model.js";
import { Subscription } from "../model/subscription.model.js";
import { Role } from "../model/role.model.js";
import mongoose from "mongoose";
import { WorkingHours } from "../model/workingHours.model.js";
import { UserBranch } from "../model/userBranch.model.js";
import { LoginVerificationMail } from "../service/sendmail.js";
import { SubscriptionAdminPlan } from "../service/checkSubscriptionPlan.js";
import { GroupBundle } from "../model/group.model.js";
import ActivityLog from "../model/ActivityLog.js";
dotenv.config();

/** -------------------- NEW: helpers for Groups → permissions -------------------- */
/** Merge helper unchanged */
const mergeGroupPermissions = (groups = []) => {
  const map = new Map();
  for (const g of groups) {
    const perms = Array.isArray(g?.permissions) ? g.permissions : [];
    for (const row of perms) {
      const key = row?.pagename;
      if (!key) continue;
      const set = new Set(map.get(key) || []);
      (Array.isArray(row?.permission) ? row.permission : []).forEach((p) =>
        set.add(p)
      );
      map.set(key, Array.from(set));
    }
  }
  return Array.from(map.entries()).map(([pagename, permission]) => ({
    pagename,
    permission,
  }));
};

const OPENCAGE_API_KEY =
  process.env.OPENCAGE_API_KEY || "d10245fed7384c039fdd70b8967f540f";

// Existing: local IP fallback
const getClientIp = (req) => {
  const xf = req.headers["x-forwarded-for"];
  if (xf) {
    const parts = String(xf)
      .split(",")
      .map((x) => x.trim());
    if (parts.length) return parts[0];
  }
  return req.ip || req.connection?.remoteAddress || "";
};

// Existing: try api.ipify.org first
const fetchPublicIp = async (req) => {
  try {
    const resp = await axios.get("https://api.ipify.org?format=json", {
      timeout: 3000,
    });
    if (resp?.data?.ip) return resp.data.ip;
  } catch (_) {
    // ignore, fallback below
  }
  return getClientIp(req);
};

// ✅ NEW: reverse geocode latitude/longitude → city/state/pincode
const reverseGeocodeOpenCage = async (latitude, longitude) => {
  if (latitude == null || longitude == null) return {};

  try {
    const resp = await axios.get(
      "https://api.opencagedata.com/geocode/v1/json",
      {
        params: {
          key: OPENCAGE_API_KEY,
          q: `${latitude},${longitude}`,
          pretty: 1,
          no_annotations: 1,
        },
        timeout: 4000,
      }
    );

    const results = resp?.data?.results;
    if (!Array.isArray(results) || !results.length) return {};

    const components = results[0].components || {};

    const city =
      components.city ||
      components.town ||
      components.village ||
      components.hamlet ||
      components._normalized_city ||
      "";

    const state = components.state || components.province || "";

    const pincode = components.postcode || "";

    return { city, state, pincode };
  } catch (_) {
    // never block login if reverse geocode fails
    return {};
  }
};

const logLoginIfPrivileged = async (req, user, { latitude, longitude }) => {
  try {
    if (!user) return;
    const roleName = (user.rolename?.roleName || "").trim();
    const isMaster = roleName === "MASTER";
    const isSuperAdmin = /super\s*admin/i.test(roleName);
    if (!isMaster && !isSuperAdmin) return; // only MASTER / Super Admin

    const now = new Date();
    const ip = await fetchPublicIp(req);

    // ✅ Get city/state/pincode from OpenCage (if lat/lng present)
    const {
      city = "",
      state = "",
      pincode = "",
    } = await reverseGeocodeOpenCage(latitude, longitude);

    await ActivityLog.create({
      userId: user._id || null,
      name: user.fullName || user.name || "",
      email: user.email || "",
      ip,
      latitude: latitude ?? null,
      longitude: longitude ?? null,
      city,
      state,
      pincode, // ✅ stored in ActivityLog
      ua: req.headers["user-agent"] || "",
      device: "", // your middleware still derives detailed device/OS on other hits
      loginAt: now,
      logoutAt: now,
      hitCount: 1,
      methodLast: "POST",
      pathLast: req.originalUrl || req.path || "/user/signin",
      statusLast: 200,
    });
  } catch (_) {
    // never block login on logging failure
  }
};

/** NEW: plan-first, no role gating, no fragile populate */
async function buildAllowedPermissionForUser(userDoc) {
  try {
    const planId = userDoc?.subscriptionPlan;
    if (!planId) return [];

    // get plan lean (no need to populate to be robust)
    const plan = await Subscription.findById(planId).lean();
    if (!plan) return [];

    const groupIds = Array.isArray(plan.groups)
      ? plan.groups.filter(Boolean)
      : [];
    if (!groupIds.length) return [];

    // fetch groups explicitly (robust even if schema ref/model name mismatched)
    const groups = await GroupBundle.find({ _id: { $in: groupIds } }).lean();

    return mergeGroupPermissions(groups);
  } catch (e) {
    console.error("buildAllowedPermissionForUser error:", e);
    return [];
  }
}

const loadallowedPermissionForUser = async (user) => {
  try {
    if (!user?.groups?.length) return [];
    const groups = await GroupBundle.find({
      _id: { $in: user.groups },
      status: "Active",
    }).lean();
    return mergeGroupPermissions(groups);
  } catch {
    return [];
  }
};

// async function buildAllowedPermissionForUser(userDoc) {
//   try {
//     // Only apply plan->groups->permissions logic for SuperAdmin
//     const roleName =
//       typeof userDoc?.rolename === "object"
//         ? userDoc?.rolename?.roleName
//         : userDoc?.rolename?.roleName; // already populated in your code

//     if (roleName !== "SuperAdmin") return [];

//     if (!userDoc?.subscriptionPlan) return [];

//     // load plan with groups
//     const plan = await Subscription.findById(userDoc.subscriptionPlan).populate(
//       {
//         path: "groups",
//         model: Group.modelName || "groupbundle",
//       }
//     );

//     if (!plan || !Array.isArray(plan.groups) || plan.groups.length === 0) {
//       return [];
//     }

//     // flatten + de-duplicate per page
//     const perPage = new Map(); // pagename -> Set(perms)
//     for (const g of plan.groups) {
//       const permsArr = Array.isArray(g?.permissions) ? g.permissions : [];
//       for (const p of permsArr) {
//         const page = p?.pagename;
//         if (!page) continue;
//         const set = perPage.get(page) || new Set();
//         (Array.isArray(p?.permission) ? p.permission : []).forEach((perm) =>
//           set.add(perm)
//         );
//         perPage.set(page, set);
//       }
//     }

//     return Array.from(perPage.entries()).map(([pagename, set]) => ({
//       pagename,
//       permission: Array.from(set),
//     }));
//   } catch {
//     return [];
//   }
// }
/** ----------------------------------------------------------------------------- */

export const SaveUser = async (req, res, next) => {
  try {
    if (req.body.id) {
      const existing = await User.findOne({
        status: "Active",
        database: req.body.database,
        id: req.body.id,
      });
      if (existing) {
        return res
          .status(404)
          .json({ message: "id already exist", status: false });
      }
    } else {
      return res
        .status(400)
        .json({ message: "user id required", status: false });
    }
    if (req.body.email) {
      const { email, database } = req.body;

      const [findUser, findCustomer] = await Promise.all([
        User.findOne({ email, status: "Active", database: database }),
        Customer.findOne({ email, status: "Active", database: database }),
      ]);

      if (findUser || findCustomer) {
        return res
          .status(409)
          .json({ message: "Email already exists", status: false });
      }
    }
    if (req.body.mobileNumber) {
      const { mobileNumber, database } = req.body;

      const [findUsers, findCustomers] = await Promise.all([
        User.findOne({ mobileNumber, status: "Active", database: database }),
        Customer.findOne({
          mobileNumber,
          status: "Active",
          database: database,
        }),
      ]);

      if (findUsers || findCustomers) {
        return res
          .status(409)
          .json({ message: "MobileNumber already exists", status: false });
      }
    }
    if (req.file) {
      req.body.profileImage = req.file.filename;
    }
    if (req.body.firstName && (req.body.Aadhar_No || req.body.Pan_No)) {
      let last4 = "";
      let existName = req.body.firstName.split(" ");
      let fname = existName[0];
      if (req.body.Aadhar_No) {
        const adhar = req.body.Aadhar_No.trim();
        last4 = adhar.slice(-4);
      } else if (req.body.Pan_No) {
        const pan = req.body.Pan_No.trim();
        last4 = pan.slice(-4);
      }

      req.body.sId = `${fname}${last4}`;
    }

    if (req.body.setRule && req.body.setRule.length > 0) {
      req.body.setRule = await JSON.parse(req.body.setRule);
    }
    if (req.body.reference && req.body.reference.length > 0) {
      req.body.reference = await JSON.parse(req.body.reference);
    }
    if (req.body.serviceArea && req.body.serviceArea?.length > 0) {
      req.body.service = await JSON.parse(req.body.serviceArea);
      delete req.body.serviceArea;
    }

    /** -------------------- NEW: accept groups from Master while creating SuperAdmin -------------------- */
    // groups could arrive as JSON string or array of ids
    if (req.body.groups) {
      try {
        if (typeof req.body.groups === "string") {
          // if sent like '["groupId1","groupId2"]'
          req.body.groups = JSON.parse(req.body.groups);
        }
      } catch {
        // ignore parse error; fall back to raw
      }
      if (!Array.isArray(req.body.groups)) req.body.groups = [];

      // validate existence (not strictly required, but safer)
      if (req.body.groups.length) {
        const count = await GroupBundle.countDocuments({
          _id: { $in: req.body.groups },
        });
        if (count !== req.body.groups.length) {
          return res
            .status(400)
            .json({ message: "One or more groups not found", status: false });
        }
      }
    } else {
      req.body.groups = [];
    }

    // If Master is creating SuperAdmin: role is NOT required.
    // If rolename is missing but groups are present, we auto-assign the "SuperAdmin" role.
    if (
      (!req.body.rolename || req.body.rolename === "") &&
      req.body.groups.length > 0
    ) {
      const superAdminRole = await Role.findOne({ roleName: "SuperAdmin" });
      if (!superAdminRole) {
        return res
          .status(404)
          .json({ message: "SuperAdmin role not configured", status: false });
      }
      req.body.rolename = superAdminRole._id.toString();
    }
    /** -------------------------------------------------------------------------------------------------- */

    if (req.body.subscriptionPlan) {
      const sub = await Subscription.findById(req.body.subscriptionPlan);
      if (sub) {
        const date = new Date();
        req.body.planStart = date;
        req.body.planEnd = new Date(
          date.getTime() + sub.days * 24 * 60 * 60 * 1000
        );
        req.body.billAmount = sub.subscriptionCost;
        req.body.userAllotted = sub.noOfUser;
        req.body.planStatus = "paid";
      }
    } else {
      const existRole = await Role.findOne({ roleName: "SuperAdmin" });
      if (!existRole) {
        console.log("Role Not Found");
      }
      const existingSuperAdmin = await User.findOne({
        database: req.body.database,
        rolename: existRole?._id?.toString(),
      });
      if (!existingSuperAdmin) {
        console.log("user not found");
      } else {
        if (existingSuperAdmin.planStatus !== "paid") {
          return res.status(404).json({
            message: "User is not subscribed to the plan",
            status: false,
          });
        } else {
          existingSuperAdmin.userRegister += 1;
          if (
            existingSuperAdmin.userRegister <= existingSuperAdmin.userAllotted
          ) {
            await existingSuperAdmin.save();
          } else {
            return res.status(400).json({
              message: "You have reached your plan's user limit",
              status: false,
            });
          }
        }
      }
    }
    if (req.body.role && req.body.role.length > 0) {
      req.body.role = JSON.parse(req.body.role);
    }
    if (req.body.rolename) {
      const findRole = await Role.findById(req.body.rolename);
      if (
        findRole?.roleName === "Labour" ||
        findRole?.roleName === "Packing And Labour"
      ) {
        const pakerId = await generateUniqueSixDigitNumber();
        req.body.pakerId = pakerId;
      }
    }
    if (req.body.warehouse) {
      req.body.warehouse = await JSON.parse(req.body.warehouse);
    }

    const user = await User.create(req.body);
    if (req.body.warehouse) {
      await assingWarehouse(user.warehouse, user._id);
    }
    if (user) {
      await setSalary(user);
      if (user?.rolename) {
        const findRoles = await Role.findById(user.rolename);

        const BATCH_SIZE = 500;

        if (
          findRoles?.roleName === "Sales Person" &&
          Array.isArray(user.service) &&
          user.service.length > 0
        ) {
          const pincodes = [
            ...new Set(
              user.service
                .map((area) => area.pincode)
                .filter((pincode) => pincode !== undefined && pincode !== null)
            ),
          ];

          for (let i = 0; i < pincodes.length; i += BATCH_SIZE) {
            const chunk = pincodes.slice(i, i + BATCH_SIZE);

            await Customer.updateMany(
              {
                $or: [
                  { created_by: "" },
                  { created_by: { $exists: false } },
                  { created_by: null },
                ],
                pincode: { $in: chunk },
              },
              { $set: { created_by: user._id } }
            );
          }
        }
      }
    }
    return user
      ? res
          .status(200)
          .json({ message: "Data Save Successfull", User: user, status: true })
      : res
          .status(400)
          .json({ message: "Something Went Wrong", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewRegisterUser = async (req, res, next) => {
  try {
    let user = await User.find({
      database: req.params.database,
      status: "Active",
    })
      .populate({ path: "branch", model: "userBranch" })
      .populate({ path: "rolename", model: "role" });
    if (user.length === 0) {
      return res.status(404).json({ message: "user not found", status: false });
    }
    return res.status(200).json({ User: user, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const SuperAdminRoleUpdate = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "user not found", status: false });
    }
    user.rolename = req.body.rolename || user.rolename;
    await user.save();
    return res
      .status(200)
      .json({ message: "updated successfull !", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};

export const ViewUserById = async (req, res, next) => {
  try {
    let user = await User.findById({ _id: req.params.id, status: "Active" })
      .populate({ path: "subscriptionPlan", model: "subscription" })
      .populate({ path: "created_by", model: "user" })
      .populate({ path: "rolename", model: "role" })
      .populate({ path: "branch", model: "userBranch" })
      .populate({ path: "shift", model: "WorkingHour" })
      .populate({ path: "warehouse.id", model: "warehouse" });
    return res.status(200).json({ User: user, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const database = req.params.database;
    const adminDetail = await getUserHierarchyDetails(userId, database);
    return adminDetail.length > 0
      ? res.status(200).json({ adminDetails: adminDetail, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const DeleteUser = async (req, res, next) => {
  try {
    const user = await User.findById({ _id: req.params.id }).populate({
      path: "rolename",
      model: "role",
    });
    if (!user) {
      return res.status(404).json({ error: "Not Found", status: false });
    }
    if (user?.rolename?.roleName === "Sales Person") {
      await Customer.updateMany(
        { created_by: user._id },
        { $unset: { created_by: "" } }
      );
    }
    user.status = "Deactive";
    await user.save();
    return res.status(200).json({ message: "delete successful", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal server error", status: false });
  }
};

export const UpdateUser = async (req, res, next) => {
  try {
    if (req.files) {
      req.files.map((file) => {
        if (file.fieldname === "profileImage") {
          req.body.profileImage = file.filename;
        } else {
          req.body.qr_code = file.filename;
        }
      });
    }
    const userId = req.params.id;
    if (req.body.role && req.body.role.length > 0) {
      req.body.role = JSON.parse(req.body.role);
    }

    // NEW: allow updating groups (optional)
    if (typeof req.body.groups === "string") {
      try {
        req.body.groups = JSON.parse(req.body.groups);
      } catch {
        /* ignore */
      }
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({ error: "user not found", status: false });
    } else {
      if (req.body.setRule) {
        req.body.setRule = JSON.parse(req.body.setRule);
      }
      if (req.body.rolename) {
        const findRole = await Role.findById(req.body.rolename);
        if (
          findRole.roleName === "Labour" ||
          findRole.roleName === "Packing And Labour"
        ) {
          if (!existingUser.pakerId) {
            const pakerId = await generateUniqueSixDigitNumber();
            req.body.pakerId = pakerId;
          }
        }
      }

      if (req.body.firstName && (req.body.Aadhar_No || req.body.Pan_No)) {
        let last4 = "";
        let existName = req.body.firstName.split(" ");
        let fname = existName[0];
        if (req.body.Aadhar_No) {
          const adhar = req.body.Aadhar_No.trim();
          last4 = adhar.slice(-4);
        } else if (req.body.Pan_No) {
          const pan = req.body.Pan_No.trim();
          last4 = pan.slice(-4);
        }
        req.body.sId = `${fname}${last4}`;
      }
      if (req.body.warehouse && req.body.warehouse?.length > 0) {
        req.body.warehouse = JSON.parse(req.body.warehouse);
      }
      if (req.body.reference && req.body.reference?.length > 0) {
        req.body.reference = await JSON.parse(req.body.reference);
      }
      if (req.body.serviceArea && req.body.serviceArea?.length > 0) {
        req.body.serviceArea = await JSON.parse(req.body.serviceArea);
      }
      const updatedUser = req.body;
      const user = await User.findByIdAndUpdate(userId, updatedUser, {
        new: true,
      });
      if (req.body.warehouse?.length > 0) {
        await assingWarehouse(user.warehouse, userId);
      }
      if (user) {
        await setSalary(user);
      }
      return res.status(200).json({
        User: user,
        message: "User Updated Successfully",
        status: true,
      });
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
// -----------------------------------------------
const otpStore = {};

// ------------------- /signin -------------------
export const SignIn = async (req, res, next) => {
  try {
    const otp = Math.floor(1000 + Math.random() * 9000);
    const { email, password, latitude, longitude, currentAddress } = req.body;

    let existingAccount = await User.findOne({ email })
      .populate({ path: "rolename", model: "role" })
      .populate({ path: "branch", model: "userBranch" })
      .populate({ path: "created_by", model: "user" });

    let existingCustomer = await Customer.findOne({ email }).populate({
      path: "rolename",
      model: "role",
    });

    if (!existingAccount && !existingCustomer) {
      return res
        .status(400)
        .json({ message: "Incorrect email", status: false });
    }

    // MASTER → send OTP (no permissions returned yet)
    if (existingAccount && existingAccount.rolename?.roleName === "MASTER") {
      existingAccount.otp = otp;
      await LoginVerificationMail(existingAccount, otp);
      await existingAccount.save();

      // NEW: activity log (MASTER success path – OTP sent)
      await logLoginIfPrivileged(req, existingAccount, { latitude, longitude });

      return res.status(200).json({
        message: "otp send successfull",
        user: {
          ...existingAccount.toObject(),
          password: undefined,
          otp: undefined,
          role: "MASTER",
        },
        status: true,
      });
    }

    // Non-MASTER password check
    if (
      (existingAccount && existingAccount.password !== password) ||
      (existingCustomer && existingCustomer.password !== password)
    ) {
      return res
        .status(400)
        .json({ message: "Incorrect password", status: false });
    }

    // Token + side effects
    const token = Jwt.sign({ subject: email }, process.env.TOKEN_SECRET_KEY);

    if (existingAccount) {
      // update last known location (optional)
      await User.updateOne(
        { email },
        { $set: { latitude, longitude, currentAddress } }
      );

      // Compute permissions ONLY for SuperAdmin here
      const allowedPermission = await buildAllowedPermissionForUser(
        existingAccount
      );

      // NEW: activity log (Super Admin / MASTER on successful login)
      await logLoginIfPrivileged(req, existingAccount, { latitude, longitude });

      return res.json({
        message: "Login successful",
        user: { ...existingAccount.toObject(), password: undefined, token },
        allowedPermission, // <- singular key to match frontend
        status: true,
      });
    }

    if (existingCustomer) {
      await Customer.updateOne(
        { email },
        { $set: { latitude, longitude, currentAddress, loginDate: new Date() } }
      );
      return res.json({
        message: "Login successful",
        user: { ...existingCustomer.toObject(), password: undefined, token },
        allowedPermission: [], // customers don’t use this
        status: true,
      });
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// ------------------- /verify-otp (MASTER final login) -------------------
// export const verifyOTP = async (req, res) => {
//   const { email, otp } = req.body;
//   try {
//     const user = await User.findOne({ email })
//       .populate({ path: "rolename", model: "role" })
//       .populate({ path: "branch", model: "userBranch" });

//     if (!user) {
//       return res.status(404).json({ message: "User Not Found" });
//     }
//     if (String(user.otp) !== String(otp)) {
//       return res.status(400).json({ error: "Invalid otp", status: false });
//     }

//     // successful MASTER login → compute allowedPermission if needed (usually empty for MASTER)
//     const token = Jwt.sign({ subject: email }, process.env.TOKEN_SECRET_KEY);
//     const allowedPermission = await buildAllowedPermissionForUser(user);

//     return res.json({
//       message: "Login Successfull",
//       user: { ...user.toObject(), password: undefined, token },
//       allowedPermission,
//       status: true,
//     });
//   } catch (error) {
//     console.error("Error verifying OTP:", error);
//     return res.status(500).json({ message: "Internal server error" });
//   }
// };

export const signInWithMob = async (req, res, next) => {
  try {
    const { mobileNumber, password } = req.body;
    const user = await User.findOne({
      mobileNumber: mobileNumber,
      password: password,
      status: "Active",
    }).populate({ path: "rolename", model: "role" });
    const result = user?.rolename?.roleName === "Sales Person";
    if (result) {
      return res.status(200).json({
        message: "User Logged In ",
        user: { ...user.toObject(), password: undefined },
        status: true,
      });
    } else {
      return res
        .status(404)
        .json({ message: "UnAuthorized User", status: false });
    }
  } catch (error) {
    console.error("err", error);
    return res
      .status(500)
      .json({ message: "Internal server error", status: false });
  }
};

export const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await User.findOne({ email: email })
      .populate({ path: "rolename", model: "role" })
      .populate({ path: "branch", model: "userBranch" });
    if (!user) {
      return res.status(404).json({ message: "User Not Found" });
    }
    if (user.otp === otp) {
      const token = Jwt.sign({ subject: email }, process.env.TOKEN_SECRET_KEY);

      // NEW: attach merged permissions from groups when OTP login (e.g., MASTER flow completes to user)
      const allowedPermission = await loadallowedPermissionForUser(user);

      return res.json({
        message: "Login Successfull",
        user: {
          ...user.toObject(),
          password: undefined,
          token,
          allowedPermission,
        }, // NEW
        status: true,
      });
    } else {
      return res.status(400).json({ error: "Invalid otp", status: false });
    }
  } catch (error) {
    console.error("Error verifying OTP:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export const EditProfile = async (req, res, next) => {
  try {
    if (req.file) {
      req.body.profileImage = req.file.filename;
    }
    if (req.body.firstName && (req.body.Aadhar_No || req.body.Pan_No)) {
      let last4 = "";
      let existName = req.body.firstName.split(" ");
      let fname = existName[0];
      if (req.body.Aadhar_No) {
        const adhar = req.body.Aadhar_No.trim();
        last4 = adhar.slice(-4);
      } else if (req.body.Pan_No) {
        const pan = req.body.Pan_No.trim();
        last4 = pan.slice(-4);
      }
      req.body.sId = `${fname}${last4}`;
    }

    const userDetail = req.body;
    const user_first = await User.findById(req.params.id);
    if (!user_first) {
      return res
        .status(404)
        .json({ error: "this user not found", status: false });
    }
    const user = await User.findByIdAndUpdate(req.params.id, userDetail, {
      new: true,
    });
    if (user)
      return res
        .status(200)
        .json({ User: user, message: "successful updated", status: true });
    return res
      .status(404)
      .json({ error: "something went wrong", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
// --------------------------------------------------------
const resetOTP = {};
export const forgetPassword = async (request, response, next) => {
  try {
    const { email } = request.body;
    const otp = Math.floor(100000 + Math.random() * 900000);
    resetOTP[email] = otp;
    const user = await User.findOne({ email: email, status: "Active" });
    const user1 = await Customer.findOne({ email: email, status: "Active" });
    if (!user && !user1) {
      return response.status(404).json({ message: "User not found" });
    }
    var mailOptions = {
      from: {
        name: "Distribution Management System",
        address: "vikramsveltose022@gmail.com",
      },
      to: email,
      subject: "Password has been reset",
      html:
        '<div style={{fontFamily: "Helvetica,Arial,sans-serif",minWidth: 1000,overflow: "auto",lineHeight: 2}}<div style={{ margin: "50px auto", width: "70%", padding: "20px 0" }}><div style={{ borderBottom: "1px solid #eee" }}><a href=""style={{ fontSize: "1.4em",color: "#00466a" textDecoration: "none",fontWeight: 600}}></a></div><p style={{ fontSize: "1.1em" }}>Hi,</p><p>The password for your Distribution Management System Password has been successfully reset</p><h2 value="otp" style={{ background: "#00466a", margin: "0 auto",width: "max-content" padding: "0 10px",color: "#fff",borderRadius: 4}}>' +
        otp +
        '</h2><p style={{ fontSize: "0.9em" }}Regards,<br />Distribution Management System</p><hr style={{ border: "none", borderTop: "1px solid #eee" }} /></div</div>',
    };
    await transporterss.sendMail(mailOptions, (error, info) => {
      !error
        ? response
            .status(201)
            .json({ user: user, message: "send otp on email", status: true })
        : console.log(error) ||
          response.json({ error: "something went wrong" });
    });
  } catch (error) {
    console.error(error);
    response.status(500).json({ message: "Internal Server error" });
  }
};
export const otpVerify = async (req, res, next) => {
  try {
    const { otp, email } = req.body;
    if (otp == resetOTP[email]) {
      delete resetOTP[email];
      return res
        .status(201)
        .json({ message: "otp matched successfully", status: true });
    } else {
      return res.status(400).json({ error: "Invalid otp", status: false });
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal server error...", status: false });
  }
};

export const updatePassword = async (request, response, next) => {
  try {
    const userId = request.params.id;
    const newPassword = request.body.password;
    const confirmPassword = request.body.confirmPassword;
    if (newPassword !== confirmPassword) {
      return response
        .status(400)
        .json({ error: "Passwords don't match", status: false });
    } else {
      const userUpdate = await User.updateOne(
        { _id: userId },
        { password: request.body.password }
      );
      const customerUpdate = await Customer.updateOne(
        { _id: userId },
        { password: request.body.password }
      );
      if (
        (userUpdate && userUpdate.modifiedCount > 0) ||
        (customerUpdate && customerUpdate.modifiedCount > 0)
      ) {
        return response
          .status(200)
          .json({ Message: "Password updated successfully", status: true });
      }
      return response
        .status(400)
        .json({ Message: "Unauthorized User...", status: false });
    }
  } catch (err) {
    console.error(err);
    return response
      .status(500)
      .json({ Message: "Internal Server Error...", status: false });
  }
};

export const ViewWarehouse = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const adminDetail = await getUserWarehouseHierarchy(userId);
    return adminDetail.length > 0
      ? res.status(200).json({ adminDetails: adminDetail, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const saveUserWithExcel = async (req, res) => {
  try {
    // let code = "code";
    let database = "database";
    let rolename = "rolename";
    let shift = "shift";
    let branch = "branch";
    const filePath = await req.file.path;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    const headerRow = worksheet.getRow(1);
    const headings = [];
    headerRow.eachCell((cell) => {
      headings.push(cell.value);
    });
    const insertedDocuments = [];
    const existingParts = [];
    const panMobile = [];
    const existingIds = [];
    const dataNotExist = [];
    const roles = [];
    const shiftss = [];
    const branchss = [];
    const planLimit = [];
    const IdNotExisting = [];
    for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex++) {
      const dataRow = worksheet.getRow(rowIndex);
      const document = {};
      for (let columnIndex = 1; columnIndex <= headings.length; columnIndex++) {
        const heading = headings[columnIndex - 1];
        const cellValue = dataRow.getCell(columnIndex).value;
        if (
          heading === "email" &&
          typeof cellValue === "object" &&
          "text" in cellValue
        ) {
          document[heading] = cellValue.text;
        } else {
          document[heading] = cellValue;
        }
        // document[heading] = cellValue;
      }
      document[database] = req.params.database;
      if (document.firstName && (document.Aadhar_No || document.Pan_No)) {
        let last4 = "";
        let existName = document.firstName.split(" ");
        let fname = existName[0];
        if (document.Aadhar_No) {
          const adhar = document.Aadhar_No.trim();
          last4 = adhar.slice(-4);
        } else if (document.Pan_No) {
          const pan = document.Pan_No.trim();
          last4 = pan.slice(-4);
        }
        document["sId"] = `${fname}${last4}`;
      }

      if (document.database) {
        const role = await Role.findOne({
          id: document.rolename,
          database: document.database,
        });
        if (!role) {
          roles.push(document.id);
        } else {
          // const shifts = await WorkingHours.findOne({ status: "Active", id: document.shift, database: document.database })
          // if (!shifts) {
          //   shiftss.push(document.id)
          // } else {
          // const branchs = await UserBranch.findOne({ id: document.branch, database: document.database })
          // if (!branchs) {
          //   branchss.push(document.id)
          // } else {
          document[rolename] = role._id.toString();
          // document[shift] = shifts._id.toString()
          // document[branch] = branchs._id.toString()
          if (document.id) {
            const existingId = await User.findOne({
              id: document.id,
              database: document.database,
              status: "Active",
            });
            console.log("existingId", existingId);
            if (existingId) {
              existingIds.push(document.id);
            } else {
              if (document.Pan_No) {
                const existingRecord = await User.findOne({
                  Pan_No: document.Pan_No,
                  database: document.database,
                  status: "Active",
                });
                if (!existingRecord) {
                  const userLimit = await SubscriptionAdminPlan(document);
                  if (userLimit) {
                    const insertedDocument = await User.create(document);
                    insertedDocuments.push(insertedDocument);
                  } else {
                    planLimit.push(document.id);
                  }
                } else {
                  existingParts.push(document.Pan_No);
                }
              } else {
                if (document.Aadhar_No) {
                  const existingRecord = await User.findOne({
                    Aadhar_No: document.Aadhar_No,
                    database: document.database,
                    status: "Active",
                  });
                  if (!existingRecord) {
                    // const userLimit = await SubscriptionAdminPlan(document);
                    // if (userLimit) {
                    const insertedDocument = await User.create(document);
                    insertedDocuments.push(insertedDocument);
                    // } else {
                    //   planLimit.push(document.id);
                    // }
                  } else {
                    existingParts.push(document.Aadhar_No);
                  }
                } else {
                  panMobile.push(document.Aadhar_No);
                }
              }
            }
          } else {
            IdNotExisting.push(document.firstName);
          }
          // }
          // }
        }
      } else {
        dataNotExist.push(document.firstName);
      }
    }
    let message = "Data Inserted Successfully";
    if (existingParts.length > 0) {
      message = `some user already exist: ${existingParts.join(", ")}`;
    } else if (panMobile.length > 0) {
      message = `Pan Or Aadhar Not Exist : ${panMobile.join(", ")}`;
    } else if (existingIds.length > 0) {
      message = `this user id already exist: ${existingIds.join(", ")}`;
    } else if (dataNotExist.length > 0) {
      message = `this user's database not exist: ${dataNotExist.join(", ")}`;
    } else if (roles.length > 0) {
      message = `this user's rolename not correct: ${roles.join(", ")}`;
    } else if (IdNotExisting.length > 0) {
      message = `this user's id is required : ${IdNotExisting.join(", ")}`;
    } else if (shiftss.length > 0) {
      message = `this user's shift id is required : ${shiftss.join(", ")}`;
    } else if (branchss.length > 0) {
      message = `this user's branch id is required : ${branchss.join(", ")}`;
    }
    if (planLimit.length > 0) {
      message = `You may have reached your plan's user limit or may not be subscribed to a plan : ${planLimit.join(
        ", "
      )}`;
    }
    return res.status(200).json({ message, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const updateUserWithExcel = async (req, res) => {
  try {
    let rolename = "rolename";
    let shift = "shift";
    let branch = "branch";
    let database = "database";
    const filePath = await req.file.path;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    const headerRow = worksheet.getRow(1);
    const headings = [];
    headerRow.eachCell((cell) => {
      headings.push(cell.value);
    });
    const insertedDocuments = [];
    const existingParts = [];
    const roles = [];
    const shiftss = [];
    const branchss = [];
    const dataNotExist = [];
    const IdNotExisting = [];
    for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex++) {
      const dataRow = worksheet.getRow(rowIndex);
      const document = {};
      for (let columnIndex = 1; columnIndex <= headings.length; columnIndex++) {
        const heading = headings[columnIndex - 1];
        const cellValue = dataRow.getCell(columnIndex).value;
        if (
          heading === "email" &&
          typeof cellValue === "object" &&
          "text" in cellValue
        ) {
          document[heading] = cellValue.text;
        } else {
          document[heading] = cellValue;
        }
        // document[heading] = cellValue;
      }
      document[database] = req.params.database;
      if (document.firstName && (document.Aadhar_No || document.Pan_No)) {
        let last4 = "";
        let existName = document.firstName.split(" ");
        let fname = existName[0];
        if (document.Aadhar_No) {
          const adhar = document.Aadhar_No.trim();
          last4 = adhar.slice(-4);
        } else if (document.Pan_No) {
          const pan = document.Pan_No.trim();
          last4 = pan.slice(-4);
        }
        document["sId"] = `${fname}${last4}`;
      }
      // if (document.database) {
      const role = await Role.findOne({
        id: document.rolename,
        database: document.database,
      });
      console.log("role", role);
      console.log("document.rolename", document.rolename);
      console.log("document.database", document.database);
      if (!role) {
        roles.push(document.id);
      } else {
        const shifts = await WorkingHours.findOne({
          id: document.shift,
          database: document.database,
          status: "Active",
        });
        if (!shifts) {
          shiftss.push(document.id);
        } else {
          const branchs = await UserBranch.findOne({
            id: document.branch,
            database: document.database,
          });
          if (!branchs) {
            branchss.push(document.id);
          } else {
            const existUser = await User.findOne({
              id: document.id,
              database: document.database,
              status: "Active",
            });
            if (!existUser) {
              IdNotExisting.push(document.id);
            } else {
              document[rolename] = role._id.toString();
              document[shift] = shifts._id.toString();
              document[branch] = branchs._id.toString();
              const filter = { id: document.id, database: req.params.database };
              const options = { new: true, upsert: true };
              const insertedDocument = await User.findOneAndUpdate(
                filter,
                document,
                options
              );
              insertedDocuments.push(insertedDocument);
            }
          }
        }
      }
      // } else {
      //   dataNotExist.push(document.id)
      // }
      // const filter = { id: document.id, database: req.params.database };
      // const options = { new: true, upsert: true };
      // const insertedDocument = await User.findOneAndUpdate(filter, document, options);
      // insertedDocuments.push(insertedDocument);
    }
    let message = "User Updated Successfully!";
    if (existingParts.length > 0) {
      message = `some user already exist: ${existingParts.join(", ")}`;
    } else if (roles.length > 0) {
      message = `this user's role id not correct : ${roles.join(", ")}`;
    } else if (shiftss.length > 0) {
      message = `this user's shift id is required : ${shiftss.join(", ")}`;
    } else if (branchss.length > 0) {
      message = `this user's branch id is required : ${branchss.join(", ")}`;
    } else if (dataNotExist.length > 0) {
      message = `this user's database not exist : ${dataNotExist.join(", ")}`;
    } else if (IdNotExisting.length > 0) {
      message = `this user's id not found : ${IdNotExisting.join(", ")}`;
    }
    return res.status(200).json({ message, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const UserList = async (req, res, next) => {
  try {
    const database = req.params.database;
    const user = await User.find({ database: database })
      .populate({ path: "created_by", model: "user" })
      .populate({ path: "rolename", model: "role" });
    let customer = await Customer.find({ database: database })
      .sort({ sortorder: -1 })
      .populate({ path: "created_by", model: "user" })
      .populate({ path: "rolename", model: "role" });
    const data = user.concat(customer);
    return data.length > 0
      ? res.status(200).json({ User: data, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const assignUser = async (req, res, next) => {
  try {
    const { childs } = req.body;
    // console.log("req", req.body)
    const manager = await User.findById({ _id: req.body.parentId });
    if (!manager) {
      return res.status(404).json({ message: "User Not Found", status: false });
    }
    for (let id of childs) {
      const person = await User.findById({ _id: id.id });
      if (person) {
        person.created_by = manager._id;
        person.database = manager.database;
        await person.save();
      }
      const customer = await Customer.findById({ _id: id.id });
      if (customer) {
        customer.created_by = manager._id;
        customer.database = manager.database;
        await customer.save();
      }
    }
    return res
      .status(200)
      .json({ message: "Users assigned successfully", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const verifyPanNo = async (req, res) => {
  try {
    const { panNo, database } = req.body;
    if (!panNo) {
      return res
        .status(400)
        .json({ status: false, message: "PAN card number is required." });
    }
    // const existingFace = await User.findOne({ Pan_No: panNo});
    const existingFace = await User.findOne({
      $or: [
        { Pan_No: panNo, database: database },
        { Aadhar_No: panNo, database: database },
      ],
    });
    if (existingFace) {
      return res.status(200).json({
        status: true,
        message: "PAN card verification successful.",
        User: existingFace,
      });
    } else {
      return res.status(404).json({
        status: false,
        message: "PAN card not found. Verification unsuccessful.",
      });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ status: false, error: "Internal Server Error" });
  }
};
export const deleteAssignUser = async (req, res, next) => {
  try {
    const { childs } = req.body;
    for (let id of childs) {
      const person = await User.findById({ _id: id.id });
      if (person) {
        person.created_by = undefined;
        // person.database = undefined;
        await person.save();
      }
      const customer = await Customer.findById({ _id: id.id });
      if (customer) {
        customer.created_by = undefined;
        // customer.database = undefined;
        await customer.save();
      }
    }
    return res
      .status(200)
      .json({ message: "Users assigned successfully", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const assingWarehouse = async function assingWarehouse(
  warehouse,
  userId
) {
  try {
    for (let id of warehouse) {
      const warehouse = await Warehouse.findById(id.id);
      if (warehouse) {
        warehouse.created_by = userId;
        warehouse.assignStatus = true;
        await warehouse.save();
      }
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const GetExcelKeys = async (req, res) => {
  const excludedKeys = [
    "_id",
    "createdAt",
    "updatedAt",
    "__v",
    "latitude",
    "longitude",
    "currentAddress",
    "warehouse",
    "typeStatus",
    "otpVerify",
    "position",
    "code",
    "created_by",
    "status",
  ];
  const modelKeys = Object.keys(User.schema.paths).filter(
    (key) => !excludedKeys.includes(key)
  );
  return res.status(200).json({ keys: modelKeys, status: true });
};

export const setSalary = async (body) => {
  try {
    const salary = [];
    let employee = [];
    for (let data of body.setRule) {
      const check = await ruleCreation.findOne({ title: data.title });
      if (check) {
        let amount =
          check.type === "percentage"
            ? (body.last_job_Salary * check.typeValue) / 100
            : check.typeValue;
        let rule = {
          employeeName: body.firstName + " " + body.lastName,
          panNo: body.Pan_No,
          salary: body.last_job_Salary,
          option: check.title,
          type: check.type,
          amount: amount,
          title: check.title,
          rule: check.rule,
          period: check.period,
          typeValue: check.typeValue,
        };
        employee.push(rule);
        salary.push(rule);
      }
    }
    let rules = {
      userId: body._id,
      database: body.database,
      employeeName: body.firstName + " " + body.lastName,
      salary: body.last_job_Salary,
      employee: employee,
    };
    const user = await ApplyRule.findOne({ userId: rules.userId });
    if (user) {
      await ApplyRule.findOneAndUpdate({ userId: rules.userId }, rules, {
        new: true,
      });
    } else {
      await ApplyRule.create(rules);
    }
    return salary;
  } catch (err) {
    console.log(err);
  }
};
export const viewApplyRules = async (req, res, next) => {
  try {
    const rule = await ApplyRule.find({
      status: "Active",
      database: req.params.database,
    });
    return rule.length > 0
      ? res.status(200).json({ ApplyRule: rule, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const viewApplyRulesById = async (req, res, next) => {
  try {
    const rule = await ApplyRule.find({
      status: "Active",
      userId: req.params.id,
    });
    return rule.length > 0
      ? res.status(200).json({ ApplyRule: rule, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const SaveUserDetail = async (req, res, next) => {
  try {
    if (req.files) {
      req.files.map((file) => {
        if (file.fieldname === "photo") {
          req.body.photo = file.filename;
        } else {
          req.body.signature = file.filename;
        }
      });
    }
    const userId = req.body.userId;
    const users = await UserDetail.findOne({
      userId: userId,
      status: "Active",
    });
    if (users) {
      const updatedData = req.body;
      const user = await UserDetail.findByIdAndUpdate(users._id, updatedData, {
        new: true,
      });
      return res.status(200).json({
        message: "update data successfull!",
        stutas: true,
        UserDetail: user,
      });
    }
    const user = await UserDetail.create(req.body);
    return user
      ? res
          .status(200)
          .json({ message: "Date Saved Successfull!", stutas: true })
      : res.status(400).json({ message: "Bad Request", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewUserDetail = async (req, res, next) => {
  try {
    const user = await UserDetail.find({
      database: req.params.database,
      status: "Active",
    }).sort({ sortorder: -1 });
    return user.length > 0
      ? res.status(200).json({ UserDetail: user, stutas: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewByIdUserDetail = async (req, res, next) => {
  try {
    const user = await UserDetail.findOne({
      userId: req.params.id,
      status: "Active",
    }).sort({ sortorder: -1 });
    return user
      ? res.status(200).json({ UserDetail: user, stutas: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const DeleteUserDetail = async (req, res, next) => {
  try {
    const user = await UserDetail.findById(req.params.id).sort({
      sortorder: -1,
    });
    if (!user) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    user.status = await "Deactive";
    await user.save();
    return res
      .status(200)
      .json({ message: "delete successfull!", stutas: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const UpdateUserDetail = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const user = await UserDetail.findById(req.params.id).sort({
      sortorder: -1,
    });
    if (!user) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    if (req.files) {
      req.files.map((file) => {
        if (file.fieldname === "photo") {
          req.body.photo = file.filename;
        } else {
          req.body.signature = file.filename;
        }
      });
    }
    const updatedData = req.body;
    await UserDetail.findByIdAndUpdate(userId, updatedData, { new: true });
    return res
      .status(200)
      .json({ message: "update data successfull!", stutas: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const SignInWithAdmin = async (req, res, next) => {
  try {
    const { email, password, latitude, longitude, currentAddress, device } =
      req.body;
    const lati = latitude.toString().slice(0, 7);
    const long = longitude.toString().slice(0, 7);
    let existingAccount = await User.findOne({ email }).populate({
      path: "rolename",
      model: "role",
    });
    if (!existingAccount) {
      return res
        .status(400)
        .json({ message: "Incorrect email", status: false });
    }
    if (existingAccount && existingAccount.password !== password) {
      return res
        .status(400)
        .json({ message: "Incorrect password", status: false });
    }
    if (
      existingAccount?.latitude &&
      existingAccount?.longitude &&
      existingAccount.latitude.toString().slice(0, 7) !== lati &&
      existingAccount.longitude.toString().slice(0, 7) !== long
    ) {
      return res
        .status(400)
        .json({ message: "location not matched", status: false });
    }
    if (existingAccount.deviceStatus === true) {
      if (existingAccount.device !== device) {
        return res
          .status(400)
          .json({ message: "device not matched", status: false });
      }
      const token = Jwt.sign({ subject: email }, process.env.TOKEN_SECRET_KEY);

      // NEW: attach merged permissions from groups
      const allowedPermission = await loadallowedPermissionForUser(
        existingAccount
      );

      return res.json({
        message: "Login successful",
        user: {
          ...existingAccount.toObject(),
          password: undefined,
          token,
          allowedPermission,
        }, // NEW
        status: true,
      });
    } else {
      const token = Jwt.sign({ subject: email }, process.env.TOKEN_SECRET_KEY);
      existingAccount.device = device;
      existingAccount.deviceStatus = true;
      await existingAccount.save();

      // NEW: attach merged permissions from groups
      const allowedPermission = await loadallowedPermissionForUser(
        existingAccount
      );

      return res.json({
        message: "Login successful",
        user: {
          ...existingAccount.toObject(),
          password: undefined,
          token,
          allowedPermission,
        }, // NEW
        status: true,
      });
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewUserHRM = async (req, res, next) => {
  try {
    const database = req.params.database;
    const adminDetail = await User.find({ database: database })
      .sort({ sortorder: -1 })
      .populate({ path: "created_by", model: "user" })
      .populate({ path: "rolename", model: "role" });
    if (!adminDetail.length > 0) {
      return res.status(400).json({ message: "not found", status: false });
    }
    return adminDetail.length > 0
      ? res.status(200).json({ User: adminDetail, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const updatePlan = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).populate({
      path: "subscriptionPlan",
      model: "subscription",
    });
    if (!user) {
      return res.status(404).json({ message: "user not found", status: false });
    }
    const userPlan = await User.findOne({
      _id: req.params.id,
      subscriptionPlan: req.body.subscriptionPlan,
    });
    if (userPlan) {
      return res
        .status(400)
        .json({ message: "this plan already exist !", status: false });
    }
    if (req.body.subscriptionPlan) {
      const sub = await Subscription.findById(req.body.subscriptionPlan);
      if (sub) {
        let perDayAmount = user.billAmount / user.subscriptionPlan.days;
        const previousDate = new Date(user.planStart);
        // const { _id, ...subWithoutId } = sub.toObject();
        const date = new Date();
        const differenceInTime = date.getTime() - previousDate.getTime();
        const differenceInDays = Math.floor(
          differenceInTime / (1000 * 3600 * 24)
        );
        user.planStart = date;
        user.planEnd = new Date(
          date.getTime() + sub.days * 24 * 60 * 60 * 1000
        );
        user.billAmount =
          sub.subscriptionCost - differenceInDays * perDayAmount;
        user.userAllotted = sub.noOfUser;
        user.subscriptionPlan = req.body.subscriptionPlan;
        await user.save();
        return res
          .status(200)
          .json({ message: "plan updated successfull!", status: true });
      }
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const customId = async (req, res, next) => {
  try {
    const Model = mongoose.model(req.body.model);
    const existingData = await Model.findById(req.body.id);
    if (!existingData) {
      return res.status(404).json({ message: "Data Not Found", status: false });
    }
    const existingId = await Model.findOne({
      database: existingData.database,
      id: req.body.userId,
    });
    if (existingId) {
      return res
        .status(404)
        .json({ message: "Id Already Exist", status: false });
    }
    existingData.id = req.body.userId;
    await existingData.save();
    return res
      .status(200)
      .json({ message: "Data Saved Successfully!", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};

const assignedNumbers = new Set();
const generateUniqueSixDigitNumber = () => {
  const uniqueNumber = Math.floor(100000 + Math.random() * 900000);
  if (assignedNumbers.has(uniqueNumber)) {
    return generateUniqueSixDigitNumber();
  }
  assignedNumbers.add(uniqueNumber);
  return uniqueNumber;
};

export const updateServiceArea = async (req, res, next) => {
  try {
    const { id, service } = req.body;
    const existingUser = await User.findById(id);
    if (!existingUser) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    existingUser.service = service;
    await existingUser.save();
    return res.status(200).json({ message: "Area Updated", status: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};
