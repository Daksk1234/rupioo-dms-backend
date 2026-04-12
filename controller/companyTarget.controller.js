import mongoose from "mongoose";
import { CompanyTarget } from "../model/companyTarget.model.js";
import { User } from "../model/user.model.js";
import { Product } from "../model/product.model.js";
import { AssignRole } from "../model/assignRoleToDepartment.model.js";
import { Customer } from "../model/customer.model.js";
import { Role } from "../model/role.model.js";
import { CreateOrder } from "../model/createOrder.model.js";

const FY_MONTHS = [
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
  "January",
  "February",
  "March",
];

const round = (num) => {
  const n = Number(num || 0);
  return Number(n.toFixed(2));
};

const toStr = (v) => (v ? String(v) : "");

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeMonth = (m) => String(m || "").trim();

const getCurrentFYAndMonth = () => {
  const now = new Date();
  const monthIndex = now.getMonth(); // 0-11
  const fullMonths = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const currentMonthName = fullMonths[monthIndex];
  const year = now.getFullYear();
  const fyStartYear = monthIndex >= 3 ? year : year - 1;
  const fy = `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, "0")}`;

  return {
    fy,
    currentMonthName,
    currentMonthOrderIndex: FY_MONTHS.indexOf(currentMonthName),
  };
};

const isPastMonthLocked = (fyear, month) => {
  const { fy: currentFY, currentMonthOrderIndex } = getCurrentFYAndMonth();
  const monthIndex = FY_MONTHS.indexOf(normalizeMonth(month));

  if (monthIndex === -1) return true;

  const currentFYStart = Number(String(currentFY).split("-")[0] || 0);
  const targetFYStart = Number(String(fyear).split("-")[0] || 0);

  if (targetFYStart < currentFYStart) return true;
  if (targetFYStart > currentFYStart) return false;

  return monthIndex < currentMonthOrderIndex;
};

const isValidSalesCustomer = (customer) => {
  const partyType = String(customer?.partyType || "")
    .trim()
    .toLowerCase();
  const companyName = String(customer?.CompanyName || "")
    .trim()
    .toUpperCase();

  if (partyType === "creditor") return false;
  if (partyType === "cash") return false;
  if (companyName === "CASH") return false;

  return true;
};

const clone = (obj) => JSON.parse(JSON.stringify(obj));

const sanitizeProductItems = (productItem = []) => {
  return (productItem || [])
    .map((p) => ({
      productId: toStr(p.productId),
      category: p.category || "",
      subCategory: p.subCategory || "",
      productName: p.productName || p.name || "",
      pQty: round(p.pQty || 0),
      sQty: round(p.sQty || 0),
      price: round(p.price || 0),
      total: round(
        p.total !== undefined
          ? p.total
          : safeNum(p.pQty || 0) * safeNum(p.price || 0),
      ),
      secondarySize: round(p.secondarySize || 1),
    }))
    .filter((p) => p.productId);
};

const scaleProducts = (products = [], multiplier = 1) => {
  return (products || []).map((p) => ({
    productId: toStr(p.productId),
    category: p.category || "",
    subCategory: p.subCategory || "",
    productName: p.productName || "",
    pQty: round(safeNum(p.pQty) * multiplier),
    sQty: round(safeNum(p.sQty) * multiplier),
    price: round(safeNum(p.price)),
    total: round(safeNum(p.total) * multiplier),
    secondarySize: round(safeNum(p.secondarySize || 1)),
  }));
};

const mergeProducts = (a = [], b = []) => {
  const map = new Map();

  [...a, ...b].forEach((p) => {
    const key = toStr(p.productId);
    if (!key) return;

    if (!map.has(key)) {
      map.set(key, {
        productId: key,
        category: p.category || "",
        subCategory: p.subCategory || "",
        productName: p.productName || "",
        pQty: round(p.pQty || 0),
        sQty: round(p.sQty || 0),
        price: round(p.price || 0),
        total: round(p.total || 0),
        secondarySize: round(p.secondarySize || 1),
      });
    } else {
      const old = map.get(key);
      old.pQty = round(safeNum(old.pQty) + safeNum(p.pQty));
      old.sQty = round(safeNum(old.sQty) + safeNum(p.sQty));
      old.total = round(safeNum(old.total) + safeNum(p.total));

      if (!old.category) old.category = p.category || "";
      if (!old.subCategory) old.subCategory = p.subCategory || "";
      if (!old.productName) old.productName = p.productName || "";
      if (!old.price) old.price = round(p.price || 0);
      if (!old.secondarySize) old.secondarySize = round(p.secondarySize || 1);

      map.set(key, old);
    }
  });

  return Array.from(map.values());
};

const sumProductTotals = (products = []) =>
  round((products || []).reduce((sum, p) => sum + safeNum(p.total), 0));

const getSalesHierarchyMeta = async (database) => {
  const departmentData = await AssignRole.find({ database }).populate({
    path: "departmentName",
    model: "department",
  });

  const salesDepartment = departmentData.find(
    (d) => d?.departmentName?.departmentName?.toLowerCase() === "sales",
  );

  if (!salesDepartment?.roles?.length) {
    throw new Error("Sales department not configured");
  }

  const roles = [...salesDepartment.roles].sort(
    (a, b) => safeNum(a.rolePosition) - safeNum(b.rolePosition),
  );

  return {
    roles,
    topRole: roles[0],
    maxRolePosition: Math.max(...roles.map((r) => safeNum(r.rolePosition))),
  };
};

const getHierarchyBaseData = async (database, roles) => {
  const [allUsers, allCustomers] = await Promise.all([
    User.find({ database, status: "Active" }).lean(),
    Customer.find({
      database,
      status: "Active",
      leadStatusCheck: "false",
    }).lean(),
  ]);

  const validCustomers = allCustomers.filter(isValidSalesCustomer);

  const userMap = new Map();
  allUsers.forEach((u) => userMap.set(toStr(u._id), u));

  const customerMap = new Map();
  validCustomers.forEach((c) => customerMap.set(toStr(c._id), c));

  const roleMetaMap = new Map();
  roles.forEach((r) => {
    roleMetaMap.set(toStr(r.roleId), {
      roleId: r.roleId,
      roleName: r.roleName,
      rolePosition: safeNum(r.rolePosition),
    });
  });

  const salesRoleIdSet = new Set(roles.map((r) => toStr(r.roleId)));

  const usersByRole = {};
  roles.forEach((r) => {
    usersByRole[toStr(r.roleId)] = allUsers.filter(
      (u) => toStr(u.rolename) === toStr(r.roleId),
    );
  });

  return {
    allUsers,
    validCustomers,
    userMap,
    customerMap,
    roleMetaMap,
    salesRoleIdSet,
    usersByRole,
  };
};

const getDirectSalesParentIdForCustomer = (
  customer,
  userMap,
  salesRoleIdSet,
) => {
  let currentParentId = toStr(customer?.created_by);

  while (currentParentId) {
    const user = userMap.get(currentParentId);
    if (!user) return null;

    if (salesRoleIdSet.has(toStr(user.rolename))) {
      return currentParentId;
    }

    currentParentId = toStr(user.created_by);
  }

  return null;
};

const getSalesChainUpward = (startUserId, userMap, roleMetaMap) => {
  const chain = [];
  let currentUserId = toStr(startUserId);

  while (currentUserId) {
    const user = userMap.get(currentUserId);
    if (!user) break;

    const roleMeta = roleMetaMap.get(toStr(user.rolename));
    if (roleMeta) {
      chain.push({
        userId: currentUserId,
        firstName: user.firstName || "Unknown",
        roleId: roleMeta.roleId,
        roleName: roleMeta.roleName,
        rolePosition: roleMeta.rolePosition,
      });
    }

    currentUserId = toStr(user.created_by);
  }

  return chain;
};

const buildMonthHierarchyFromCompanyProducts = ({
  monthProducts,
  validCustomers,
  userMap,
  salesRoleIdSet,
  roleMetaMap,
  customerRolePosition,
}) => {
  const validCustomerAssignments = validCustomers
    .map((customer) => ({
      customer,
      salesParentId: getDirectSalesParentIdForCustomer(
        customer,
        userMap,
        salesRoleIdSet,
      ),
    }))
    .filter((x) => !!x.salesParentId);

  if (!validCustomerAssignments.length) {
    throw new Error("No valid customer linked to salesperson hierarchy");
  }

  const companyTotal = sumProductTotals(monthProducts);
  const customerCount = validCustomerAssignments.length;
  const perCustomerProducts = scaleProducts(monthProducts, 1 / customerCount);
  const perCustomerTotal = sumProductTotals(perCustomerProducts);

  const targetMap = new Map();

  validCustomerAssignments.forEach(({ customer, salesParentId }) => {
    const customerId = toStr(customer._id);

    targetMap.set(customerId, {
      userId: customerId,
      firstName: customer.CompanyName || customer.firstName || "Unknown",
      roleId: null,
      roleName: "Customer",
      rolePosition: customerRolePosition,
      total: perCustomerTotal,
      products: clone(perCustomerProducts),
    });

    const chain = getSalesChainUpward(salesParentId, userMap, roleMetaMap);

    chain.forEach((node) => {
      if (!targetMap.has(node.userId)) {
        targetMap.set(node.userId, {
          userId: node.userId,
          firstName: node.firstName,
          roleId: node.roleId,
          roleName: node.roleName,
          rolePosition: node.rolePosition,
          total: 0,
          products: [],
        });
      }

      const old = targetMap.get(node.userId);
      old.total = round(safeNum(old.total) + perCustomerTotal);
      old.products = mergeProducts(old.products || [], perCustomerProducts);
      targetMap.set(node.userId, old);
    });
  });

  return {
    targetMap,
    companyTotal,
    customerCount,
    perCustomerProducts,
    perCustomerTotal,
  };
};

const saveManagerWiseDocs = async ({
  database,
  fyear,
  month,
  incrementper,
  monthProducts,
  companyTotal,
  targetMap,
  usersByRole,
  topRole,
  userMap,
  created_by,
}) => {
  const managers = usersByRole[toStr(topRole.roleId)] || [];

  for (const manager of managers) {
    const managerId = toStr(manager._id);
    const managerNode = targetMap.get(managerId);

    if (!managerNode) {
      await CompanyTarget.deleteOne({
        database,
        fyear,
        month,
        managerId: manager._id,
      });
      continue;
    }

    const hierarchyTargets = Array.from(targetMap.values()).filter((t) => {
      const nodeId = toStr(t.userId);
      if (nodeId === managerId) return true;

      let currentId = nodeId;

      while (currentId) {
        if (currentId === managerId) return true;
        const currentUser = userMap.get(currentId);
        if (!currentUser) break;
        currentId = toStr(currentUser.created_by);
      }

      return false;
    });

    await CompanyTarget.findOneAndUpdate(
      {
        database,
        fyear,
        month,
        managerId: manager._id,
      },
      {
        $set: {
          incrementper: String(incrementper),
          companyTotal: round(companyTotal),
          managerId: manager._id,
          managerName: manager.firstName || "Unknown",
          managerTotal: round(managerNode.total || 0),
          productItem: monthProducts,
          hierarchyTargets,
          created_by,
        },
      },
      { upsert: true, new: true },
    );
  }
};

const regenerateTargetsFromMonth = async ({
  database,
  fyear,
  startMonth,
  incrementper = 0,
  startMonthProductItem,
  created_by,
}) => {
  const startIndex = FY_MONTHS.indexOf(normalizeMonth(startMonth));
  if (startIndex === -1) throw new Error("Invalid month");

  const { roles, topRole, maxRolePosition } =
    await getSalesHierarchyMeta(database);

  const { validCustomers, userMap, roleMetaMap, salesRoleIdSet, usersByRole } =
    await getHierarchyBaseData(database, roles);

  if (!validCustomers.length) {
    throw new Error("No valid customers found for target generation");
  }

  const customerRolePosition = maxRolePosition + 1;
  let previousMonthProducts = null;

  for (let i = startIndex; i < FY_MONTHS.length; i++) {
    const currentMonth = FY_MONTHS[i];
    let monthProducts = [];

    if (i === startIndex) {
      monthProducts = sanitizeProductItems(startMonthProductItem);
    } else {
      const multiplier = 1 + safeNum(incrementper) / 100;
      monthProducts = scaleProducts(previousMonthProducts, multiplier);
    }

    previousMonthProducts = clone(monthProducts);

    const { targetMap, companyTotal } = buildMonthHierarchyFromCompanyProducts({
      monthProducts,
      validCustomers,
      userMap,
      salesRoleIdSet,
      roleMetaMap,
      customerRolePosition,
    });

    await saveManagerWiseDocs({
      database,
      fyear,
      month: currentMonth,
      incrementper,
      monthProducts,
      companyTotal,
      targetMap,
      usersByRole,
      topRole,
      userMap,
      created_by,
    });
  }
};

const getMonthDocs = async (database, fyear, month) => {
  return CompanyTarget.find({ database, fyear, month }).lean();
};

const getOneMonthAggregatedView = async (database, fyear, month) => {
  const docs = await CompanyTarget.find({ database, fyear, month }).lean();

  if (!docs.length) return null;

  const targetMap = new Map();
  let companyTotal = 0;
  let productItem = [];
  let incrementper = safeNum(docs[0]?.incrementper || 0);

  docs.forEach((doc, idx) => {
    if (idx === 0) {
      companyTotal = safeNum(doc.companyTotal);
      productItem = clone(doc.productItem || []);
    }

    (doc.hierarchyTargets || []).forEach((ht) => {
      const key = `${safeNum(ht.rolePosition)}-${toStr(ht.userId)}`;
      if (!targetMap.has(key)) {
        targetMap.set(key, clone(ht));
      }
    });
  });

  return {
    docs,
    companyTotal: round(companyTotal),
    productItem,
    incrementper,
    hierarchyTargets: Array.from(targetMap.values()),
  };
};

const saveUpdatedMonthDocsFromHierarchyTargets = async ({
  database,
  fyear,
  month,
  incrementper,
  companyTotal,
  productItem,
  hierarchyTargets,
  created_by,
}) => {
  const { roles, topRole } = await getSalesHierarchyMeta(database);
  const { userMap, usersByRole } = await getHierarchyBaseData(database, roles);

  const targetMap = new Map();
  (hierarchyTargets || []).forEach((ht) => {
    targetMap.set(toStr(ht.userId), clone(ht));
  });

  await saveManagerWiseDocs({
    database,
    fyear,
    month,
    incrementper,
    monthProducts: productItem,
    companyTotal,
    targetMap,
    usersByRole,
    topRole,
    userMap,
    created_by,
  });
};

const propagateDifferenceUpwardInHierarchyTargets = ({
  hierarchyTargets,
  startParentId,
  diff,
  userMap,
}) => {
  let currentParentId = toStr(startParentId);

  while (currentParentId) {
    const idx = hierarchyTargets.findIndex(
      (h) => toStr(h.userId) === currentParentId,
    );

    if (idx !== -1) {
      hierarchyTargets[idx].total = round(
        safeNum(hierarchyTargets[idx].total) + safeNum(diff),
      );
    }

    const parentUser = userMap.get(currentParentId);
    currentParentId = toStr(parentUser?.created_by);
  }

  return hierarchyTargets;
};

const findCustomerRolePositionInDoc = (doc) => {
  const maxPos = Math.max(
    ...(doc?.hierarchyTargets || []).map((h) => safeNum(h.rolePosition || 0)),
  );
  return maxPos;
};

export const saveCompanyTarget = async (req, res) => {
  try {
    const {
      database,
      fyear,
      month,
      incrementper = 0,
      productItem,
      created_by,
    } = req.body;

    if (!database || !fyear || !month || !productItem?.length || !created_by) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (isPastMonthLocked(fyear, month)) {
      return res.status(400).json({
        success: false,
        message: "Completed month target cannot be edited",
      });
    }

    await regenerateTargetsFromMonth({
      database,
      fyear,
      startMonth: month,
      incrementper,
      startMonthProductItem: productItem,
      created_by,
    });

    return res.status(201).json({
      success: true,
      message:
        "Company target saved successfully and divided equally among valid customers",
    });
  } catch (error) {
    console.error("saveCompanyTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getCompanyTarget = async (req, res) => {
  try {
    const { database, fyear } = req.params;

    if (!database || !fyear) {
      return res.status(400).json({
        success: false,
        message: "database and fyear required",
      });
    }

    const companyTargets = await CompanyTarget.find({ database, fyear })
      .sort({ createdAt: 1 })
      .lean();

    if (!companyTargets.length) {
      return res.status(404).json({
        success: false,
        message: "Company targets not found",
      });
    }

    const allUserIds = new Set();
    const allRoleIds = new Set();

    companyTargets.forEach((target) => {
      (target.hierarchyTargets || []).forEach((ht) => {
        if (ht.userId) allUserIds.add(toStr(ht.userId));
        if (ht.roleId) allRoleIds.add(toStr(ht.roleId));
      });
    });

    const [users, roles, customers] = await Promise.all([
      User.find({ _id: { $in: Array.from(allUserIds) } })
        .select("firstName created_by rolename")
        .lean(),
      Role.find({ _id: { $in: Array.from(allRoleIds) } })
        .select("roleName")
        .lean(),
      Customer.find({ _id: { $in: Array.from(allUserIds) } })
        .select("CompanyName _id partyType")
        .lean(),
    ]);

    const userMap = {};
    users.forEach((u) => {
      userMap[toStr(u._id)] = u.firstName || "Unknown";
    });

    const roleMap = {};
    roles.forEach((r) => {
      roleMap[toStr(r._id)] = r.roleName || "Unknown";
    });

    const customerMap = {};
    customers.forEach((c) => {
      customerMap[toStr(c._id)] = {
        CompanyName: c.CompanyName || "Unknown",
        partyType: c.partyType || "",
      };
    });

    const monthMap = new Map();
    let yearlyTarget = 0;

    companyTargets.forEach((doc) => {
      const month = doc.month;

      if (!monthMap.has(month)) {
        monthMap.set(month, {
          month,
          incrementper: safeNum(doc.incrementper || 0),
          companyTotal: round(doc.companyTotal || 0),
          productItem: clone(doc.productItem || []),
          grouped: {},
        });

        yearlyTarget += safeNum(doc.companyTotal || 0);
      }

      const monthEntry = monthMap.get(month);

      (doc.hierarchyTargets || []).forEach((ht) => {
        const rolePos = safeNum(ht.rolePosition);
        const userId = toStr(ht.userId);
        const roleName =
          roleMap[toStr(ht.roleId)] ||
          (customerMap[userId] ? "Customer" : "Unknown");

        if (
          roleName.toLowerCase() === "customer" &&
          customerMap[userId] &&
          !isValidSalesCustomer({
            CompanyName: customerMap[userId].CompanyName,
            partyType: customerMap[userId].partyType,
          })
        ) {
          return;
        }

        if (!monthEntry.grouped[rolePos]) {
          monthEntry.grouped[rolePos] = {
            rolePosition: rolePos,
            roleName,
            users: [],
          };
        }

        const already = monthEntry.grouped[rolePos].users.some(
          (u) => toStr(u.userId) === userId,
        );
        if (already) return;

        let firstName = userMap[userId] || "Unknown";
        if (roleName.toLowerCase() === "customer" && customerMap[userId]) {
          firstName = customerMap[userId].CompanyName || "Unknown";
        }

        monthEntry.grouped[rolePos].users.push({
          userId,
          firstName,
          total: round(ht.total || 0),
          products: clone(ht.products || []),
        });
      });
    });

    const data = FY_MONTHS.map((month) => {
      const item = monthMap.get(month);
      if (!item) return null;

      Object.values(item.grouped).forEach((layer) => {
        layer.users.sort((a, b) =>
          String(a.firstName || "").localeCompare(String(b.firstName || "")),
        );
      });

      return {
        month: item.month,
        incrementper: safeNum(item.incrementper),
        companyTotal: round(item.companyTotal),
        productItem: item.productItem || [],
        layers: Object.values(item.grouped).sort(
          (a, b) => safeNum(a.rolePosition) - safeNum(b.rolePosition),
        ),
      };
    }).filter(Boolean);

    return res.status(200).json({
      success: true,
      fyear,
      yearlyTarget: round(yearlyTarget),
      data,
    });
  } catch (error) {
    console.error("getCompanyTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getSalesManagerTarget = async (req, res) => {
  try {
    const { fyear, salesManagerId } = req.params;

    const companyTargets = await CompanyTarget.find({
      fyear,
      managerId: salesManagerId,
    })
      .sort({ createdAt: 1 })
      .lean();

    if (!companyTargets.length) {
      return res.status(404).json({
        success: false,
        message:
          "Targets not found for this sales manager in this financial year",
      });
    }

    const result = companyTargets.map((target) => ({
      month: target.month,
      totalTarget: round(target.managerTotal || 0),
      products: clone(target.productItem || []),
    }));

    return res.status(200).json({
      success: true,
      fyear,
      salesManagerId,
      monthlyTargets: result,
    });
  } catch (error) {
    console.error("getSalesManagerTarget error:", error);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const deleteCompanyTarget = async (req, res) => {
  try {
    const { database, fyear } = req.body;

    if (!database || !fyear) {
      return res.status(400).json({
        success: false,
        message: "database and fyear are required",
      });
    }

    const deletedResult = await CompanyTarget.deleteMany({
      database,
      fyear,
    });

    if (deletedResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No company targets found to delete",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Company targets deleted successfully",
      deletedCount: deletedResult.deletedCount,
    });
  } catch (error) {
    console.error("deleteCompanyTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateCompanyTarget = async (req, res) => {
  try {
    const {
      database,
      fyear,
      month,
      incrementper = 0,
      productItem,
      created_by,
    } = req.body;

    if (!database || !fyear || !month || !productItem?.length || !created_by) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (isPastMonthLocked(fyear, month)) {
      return res.status(400).json({
        success: false,
        message: "Completed month target cannot be edited",
      });
    }

    await regenerateTargetsFromMonth({
      database,
      fyear,
      startMonth: month,
      incrementper,
      startMonthProductItem: productItem,
      created_by,
    });

    return res.status(200).json({
      success: true,
      message:
        "Company target updated successfully and redistributed equally among valid customers",
    });
  } catch (error) {
    console.error("updateCompanyTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const updateCustomerTarget = async (req, res) => {
  try {
    const {
      database,
      fyear,
      month,
      customerId,
      incrementper = 0,
      productItem,
      created_by,
    } = req.body;

    if (!database || !fyear || !month || !customerId || !productItem?.length) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (isPastMonthLocked(fyear, month)) {
      return res.status(400).json({
        success: false,
        message: "Completed month target cannot be edited",
      });
    }

    const customer = await Customer.findOne({
      _id: customerId,
      database,
      status: "Active",
    }).lean();

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "Customer not found",
      });
    }

    if (!isValidSalesCustomer(customer)) {
      return res.status(400).json({
        success: false,
        message: "Invalid customer for sales target",
      });
    }

    const startIndex = FY_MONTHS.indexOf(normalizeMonth(month));
    if (startIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "Invalid month",
      });
    }

    const { roles } = await getSalesHierarchyMeta(database);
    const { userMap } = await getHierarchyBaseData(database, roles);

    let previousMonthProducts = null;
    let updatedMonths = 0;

    for (let i = startIndex; i < FY_MONTHS.length; i++) {
      const currentMonth = FY_MONTHS[i];
      const monthDocs = await CompanyTarget.find({
        database,
        fyear,
        month: currentMonth,
        "hierarchyTargets.userId": customerId,
      });

      if (!monthDocs.length) continue;

      let newCustomerProducts = [];

      if (i === startIndex) {
        newCustomerProducts = sanitizeProductItems(productItem);
      } else {
        const multiplier = 1 + safeNum(incrementper) / 100;
        newCustomerProducts = scaleProducts(previousMonthProducts, multiplier);
      }

      previousMonthProducts = clone(newCustomerProducts);
      const newCustomerTotal = sumProductTotals(newCustomerProducts);

      for (const doc of monthDocs) {
        const customerRolePosition = findCustomerRolePositionInDoc(doc);

        const customerIndex = doc.hierarchyTargets.findIndex(
          (h) =>
            toStr(h.userId) === toStr(customerId) &&
            safeNum(h.rolePosition) === customerRolePosition,
        );

        if (customerIndex === -1) continue;

        const oldTotal = safeNum(doc.hierarchyTargets[customerIndex].total);
        const diff = round(newCustomerTotal - oldTotal);

        doc.hierarchyTargets[customerIndex].products =
          clone(newCustomerProducts);
        doc.hierarchyTargets[customerIndex].total = round(newCustomerTotal);

        const updatedTargets = propagateDifferenceUpwardInHierarchyTargets({
          hierarchyTargets: doc.hierarchyTargets,
          startParentId: customer.created_by,
          diff,
          userMap,
        });

        const salespersonId = getDirectSalesParentIdForCustomer(
          customer,
          userMap,
          new Set(roles.map((r) => toStr(r.roleId))),
        );

        if (salespersonId) {
          const salespersonIndex = updatedTargets.findIndex(
            (h) => toStr(h.userId) === toStr(salespersonId),
          );

          if (salespersonIndex !== -1) {
            const allChildCustomers = updatedTargets.filter(
              (h) => safeNum(h.rolePosition) === customerRolePosition,
            );

            const childCustomersOfSalesperson = allChildCustomers.filter(
              (c) => {
                let pid = toStr(
                  customerMapSafeGetParent(
                    c.userId,
                    customerId,
                    customer,
                    userMap,
                  ),
                );
                while (pid) {
                  if (pid === toStr(salespersonId)) return true;
                  const pu = userMap.get(pid);
                  pid = toStr(pu?.created_by);
                }
                return false;
              },
            );

            const mergedSalespersonProducts =
              childCustomersOfSalesperson.reduce(
                (acc, c) => mergeProducts(acc, c.products || []),
                [],
              );

            updatedTargets[salespersonIndex].products =
              mergedSalespersonProducts;
          }
        }

        doc.hierarchyTargets = updatedTargets;
        doc.incrementper = String(incrementper);
        doc.created_by = created_by;
        doc.companyTotal = round(safeNum(doc.companyTotal) + diff);
        doc.productItem = recalculateCompanyProductsFromCustomerTargets(
          doc.hierarchyTargets,
          customerRolePosition,
        );
        doc.managerTotal = round(
          safeNum(
            doc.hierarchyTargets.find(
              (h) => toStr(h.userId) === toStr(doc.managerId),
            )?.total || 0,
          ),
        );

        await doc.save();
        updatedMonths++;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Customer target updated successfully",
      totalMonthsUpdated: updatedMonths,
    });
  } catch (error) {
    console.error("updateCustomerTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// helper used by updateCustomerTarget
const customerMapSafeGetParent = (
  targetCustomerId,
  editingCustomerId,
  editingCustomer,
  userMap,
) => {
  if (toStr(targetCustomerId) === toStr(editingCustomerId)) {
    return editingCustomer?.created_by;
  }
  return null;
};

const recalculateCompanyProductsFromCustomerTargets = (
  hierarchyTargets,
  customerRolePosition,
) => {
  const customerTargets = (hierarchyTargets || []).filter(
    (h) => safeNum(h.rolePosition) === safeNum(customerRolePosition),
  );

  return customerTargets.reduce(
    (acc, c) => mergeProducts(acc, c.products || []),
    [],
  );
};

// NEW API: salesperson edit
export const updateSalespersonTarget = async (req, res) => {
  try {
    const {
      database,
      fyear,
      month,
      salespersonId,
      incrementper = 0,
      totalTarget,
      created_by,
    } = req.body;

    if (
      !database ||
      !fyear ||
      !month ||
      !salespersonId ||
      totalTarget === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    if (isPastMonthLocked(fyear, month)) {
      return res.status(400).json({
        success: false,
        message: "Completed month target cannot be edited",
      });
    }

    const startIndex = FY_MONTHS.indexOf(normalizeMonth(month));
    if (startIndex === -1) {
      return res.status(400).json({
        success: false,
        message: "Invalid month",
      });
    }

    const { roles } = await getSalesHierarchyMeta(database);
    const { validCustomers, userMap, salesRoleIdSet } =
      await getHierarchyBaseData(database, roles);

    let previousSalespersonTotal = safeNum(totalTarget);
    let updatedMonths = 0;

    for (let i = startIndex; i < FY_MONTHS.length; i++) {
      const currentMonth = FY_MONTHS[i];
      const docs = await CompanyTarget.find({
        database,
        fyear,
        month: currentMonth,
        "hierarchyTargets.userId": salespersonId,
      });

      if (!docs.length) continue;

      const multiplier = i === startIndex ? 1 : 1 + safeNum(incrementper) / 100;
      const monthSalespersonTotal =
        i === startIndex
          ? safeNum(totalTarget)
          : round(previousSalespersonTotal * multiplier);

      previousSalespersonTotal = monthSalespersonTotal;

      for (const doc of docs) {
        const customerRolePosition = findCustomerRolePositionInDoc(doc);

        const childCustomers = validCustomers.filter((cust) => {
          const spId = getDirectSalesParentIdForCustomer(
            cust,
            userMap,
            salesRoleIdSet,
          );
          return toStr(spId) === toStr(salespersonId);
        });

        if (!childCustomers.length) {
          continue;
        }

        const existingSalespersonNode = doc.hierarchyTargets.find(
          (h) => toStr(h.userId) === toStr(salespersonId),
        );

        if (!existingSalespersonNode) continue;

        const oldSalespersonTotal = safeNum(existingSalespersonNode.total);
        const diffForSalesperson = round(
          monthSalespersonTotal - oldSalespersonTotal,
        );

        const oldChildCustomerNodes = doc.hierarchyTargets.filter((h) =>
          childCustomers.some((c) => toStr(c._id) === toStr(h.userId)),
        );

        const oldSalespersonProducts = oldChildCustomerNodes.reduce(
          (acc, c) => mergeProducts(acc, c.products || []),
          [],
        );

        const customerCount = childCustomers.length;
        const newCustomerProductsTemplate = scaleProducts(
          oldSalespersonProducts,
          customerCount > 0 ? 1 / customerCount : 0,
        );
        const newCustomerTotal = sumProductTotals(newCustomerProductsTemplate);

        childCustomers.forEach((cust) => {
          const cIdx = doc.hierarchyTargets.findIndex(
            (h) =>
              toStr(h.userId) === toStr(cust._id) &&
              safeNum(h.rolePosition) === customerRolePosition,
          );

          if (cIdx !== -1) {
            doc.hierarchyTargets[cIdx].products = clone(
              newCustomerProductsTemplate,
            );
            doc.hierarchyTargets[cIdx].total = round(newCustomerTotal);
          }
        });

        const spIdx = doc.hierarchyTargets.findIndex(
          (h) => toStr(h.userId) === toStr(salespersonId),
        );
        if (spIdx !== -1) {
          doc.hierarchyTargets[spIdx].products = scaleProducts(
            newCustomerProductsTemplate,
            customerCount,
          );
          doc.hierarchyTargets[spIdx].total = round(monthSalespersonTotal);
        }

        let parentId = toStr(userMap.get(toStr(salespersonId))?.created_by);
        while (parentId) {
          const pIdx = doc.hierarchyTargets.findIndex(
            (h) => toStr(h.userId) === toStr(parentId),
          );
          if (pIdx !== -1) {
            doc.hierarchyTargets[pIdx].total = round(
              safeNum(doc.hierarchyTargets[pIdx].total) + diffForSalesperson,
            );
          }
          const pu = userMap.get(parentId);
          parentId = toStr(pu?.created_by);
        }

        doc.companyTotal = round(
          safeNum(doc.companyTotal) + diffForSalesperson,
        );
        doc.productItem = recalculateCompanyProductsFromCustomerTargets(
          doc.hierarchyTargets,
          customerRolePosition,
        );
        doc.managerTotal = round(
          safeNum(
            doc.hierarchyTargets.find(
              (h) => toStr(h.userId) === toStr(doc.managerId),
            )?.total || 0,
          ),
        );
        doc.incrementper = String(incrementper);
        doc.created_by = created_by;

        await doc.save();
        updatedMonths++;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Salesperson target updated successfully",
      totalMonthsUpdated: updatedMonths,
    });
  } catch (error) {
    console.error("updateSalespersonTarget error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const achievedTarget = async (req, res) => {
  try {
    const { database, fyear } = req.params;

    if (!database || !fyear) {
      return res.status(400).json({
        success: false,
        message: "database and fyear required",
      });
    }

    const [startYear, shortEndYear] = String(fyear).split("-");
    const endYear = Number(String(startYear).slice(0, 2) + shortEndYear);

    const startDate = new Date(`${startYear}-04-01T00:00:00.000Z`);
    const endDate = new Date(`${endYear}-03-31T23:59:59.999Z`);

    const getFYIndex = (m) => (m >= 4 ? m - 4 : m + 8);

    const aggData = await CreateOrder.aggregate([
      {
        $match: {
          database,
          status: "completed",
          date: { $gte: startDate, $lte: endDate },
        },
      },
      { $unwind: "$orderItems" },
      { $addFields: { month: { $month: "$date" } } },
      {
        $group: {
          _id: {
            party: "$partyId",
            product: "$orderItems.productId",
            month: "$month",
          },
          qty: { $sum: "$orderItems.qty" },
          total: { $sum: "$orderItems.totalPrice" },
        },
      },
      {
        $group: {
          _id: {
            party: "$_id.party",
            month: "$_id.month",
          },
          products: {
            $push: {
              productId: "$_id.product",
              qty: "$qty",
              total: "$total",
            },
          },
          total: { $sum: "$total" },
        },
      },
      {
        $group: {
          _id: "$_id.month",
          parties: {
            $push: {
              partyId: "$_id.party",
              total: "$total",
              products: "$products",
            },
          },
          companyTotal: { $sum: "$total" },
        },
      },
    ]);

    if (!aggData.length) {
      return res.status(404).json({
        success: false,
        message: "No data found",
      });
    }

    const [customersRaw, users, products, departmentData] = await Promise.all([
      Customer.find({ database, status: "Active" }).lean(),
      User.find({ database, status: "Active" }).lean(),
      Product.find({ database }).lean(),
      AssignRole.find({ database }).populate({
        path: "departmentName",
        model: "department",
      }),
    ]);

    const customers = customersRaw.filter(isValidSalesCustomer);

    const customerMap = new Map(customers.map((c) => [toStr(c._id), c]));
    const userMap = new Map(users.map((u) => [toStr(u._id), u]));
    const productMap = new Map(products.map((p) => [toStr(p._id), p]));

    const salesDept = departmentData.find(
      (d) => d?.departmentName?.departmentName?.toLowerCase() === "sales",
    );

    let roles = [...(salesDept?.roles || [])].sort(
      (a, b) => safeNum(a.rolePosition) - safeNum(b.rolePosition),
    );

    const bottomRole = roles[roles.length - 1];

    const mergeAchievedProducts = (a = [], b = []) => {
      const map = {};

      [...a, ...b].forEach((p) => {
        const key = toStr(p.productId);
        if (!key) return;

        if (!map[key]) {
          const product = productMap.get(key);
          map[key] = {
            productId: key,
            productName: product?.Product_Title || "Unknown",
            qty: safeNum(p.qty),
            total: safeNum(p.total),
          };
        } else {
          map[key].qty += safeNum(p.qty);
          map[key].total += safeNum(p.total);
        }
      });

      return Object.values(map);
    };

    const getParent = (id) => {
      const c = customerMap.get(toStr(id));
      if (c) return c.created_by ? toStr(c.created_by) : null;

      const u = userMap.get(toStr(id));
      return u?.created_by ? toStr(u.created_by) : null;
    };

    const getUserInfo = (id) => {
      const c = customerMap.get(toStr(id));
      if (c) {
        return {
          name: c.CompanyName || c.firstName || "Unknown",
          roleName: bottomRole?.roleName || "CUSTOMER",
          rolePosition: safeNum(bottomRole?.rolePosition || roles.length + 1),
        };
      }

      const u = userMap.get(toStr(id));
      if (!u) {
        return {
          name: "Unknown",
          roleName: "UNKNOWN",
          rolePosition: roles.length + 2,
        };
      }

      const roleData = roles.find((r) => toStr(r.roleId) === toStr(u.rolename));

      return {
        name: u.firstName || "Unknown",
        roleName: roleData?.roleName || "UNKNOWN",
        rolePosition: safeNum(roleData?.rolePosition ?? roles.length + 2),
      };
    };

    const buildChain = (id) => {
      const chain = [];
      let current = toStr(id);

      while (current) {
        const info = getUserInfo(current);
        chain.push({
          userId: current,
          firstName: info.name,
          roleName: info.roleName,
          rolePosition: info.rolePosition,
        });
        current = getParent(current);
      }

      return chain;
    };

    const finalMap = new Map();

    for (const mData of aggData) {
      const monthName = FY_MONTHS[getFYIndex(mData._id)];

      if (!finalMap.has(monthName)) {
        finalMap.set(monthName, {
          month: monthName,
          companyTotal: 0,
          layers: [],
        });
      }

      const monthEntry = finalMap.get(monthName);
      monthEntry.companyTotal += safeNum(mData.companyTotal);

      const hierarchy = {};

      for (const p of mData.parties) {
        if (!customerMap.has(toStr(p.partyId))) continue;

        const chain = buildChain(toStr(p.partyId));

        chain.forEach((node) => {
          if (!hierarchy[node.userId]) {
            hierarchy[node.userId] = {
              userId: node.userId,
              firstName: node.firstName,
              roleName: node.roleName,
              rolePosition: node.rolePosition,
              total: 0,
              products: [],
            };
          }

          hierarchy[node.userId].total += safeNum(p.total);
          hierarchy[node.userId].products = mergeAchievedProducts(
            hierarchy[node.userId].products,
            p.products,
          );
        });
      }

      const layerMap = {};
      Object.values(hierarchy).forEach((u) => {
        const key = `${u.rolePosition}-${u.roleName}`;
        if (!layerMap[key]) {
          layerMap[key] = {
            rolePosition: u.rolePosition,
            roleName: u.roleName,
            users: [],
          };
        }

        layerMap[key].users.push({
          userId: u.userId,
          firstName: u.firstName,
          total: round(u.total),
          products: u.products,
        });
      });

      monthEntry.layers = Object.values(layerMap).sort(
        (a, b) => safeNum(a.rolePosition) - safeNum(b.rolePosition),
      );
    }

    const finalData = FY_MONTHS.map((m) => finalMap.get(m)).filter(Boolean);

    return res.status(200).json({
      success: true,
      fyear,
      data: finalData,
    });
  } catch (err) {
    console.error("achievedTarget error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};
