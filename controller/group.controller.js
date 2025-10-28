import { GroupBundle } from "../model/group.model.js";

// CREATE
// CREATE
export const SaveGroup = async (req, res) => {
  try {
    const payload = {
      groupName: req.body.groupName,
      groupDesc: req.body.groupDesc || "",
      permissions: Array.isArray(req.body.permissions)
        ? req.body.permissions
        : [],
      status: req.body.status || "Active",
    };

    if (!payload.groupName?.trim()) {
      return res
        .status(400)
        .json({ message: "groupName is required", status: false });
    }

    const created = await GroupBundle.create(payload);
    // ✅ Return the created document so you can confirm it on the client
    return res
      .status(201)
      .json({
        message: "data saved successfull",
        status: true,
        Group: created,
      });
  } catch (err) {
    console.error(err);
    const dup =
      err?.code === 11000
        ? "Group name already exists"
        : "Internal Server Error";
    return res.status(500).json({ error: dup, status: false });
  }
};

// LIST (Active by default)
export const ViewGroups = async (req, res) => {
  try {
    const q = {};
    if (!req.query.includeDeactive) q.status = "Active";
    const list = await GroupBundle.find(q).sort({ createdAt: -1 });
    if (!list.length)
      return res.status(404).json({ message: "Not Found", status: false });
    return res.status(200).json({ Groups: list, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// GET BY ID
export const ViewGroupById = async (req, res) => {
  try {
    const doc = await GroupBundle.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Not Found", status: false });
    return res.status(200).json({ Group: doc, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// SOFT DELETE → Deactive
export const DeleteGroup = async (req, res) => {
  try {
    const doc = await GroupBundle.findById(req.params.id);
    if (!doc)
      return res.status(404).json({ message: "Not Found", status: false });
    doc.status = "Deactive";
    await doc.save();
    return res
      .status(200)
      .json({ message: "delete successfull", status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

// UPDATE
export const UpdateGroup = async (req, res) => {
  try {
    const exists = await GroupBundle.findById(req.params.id);
    if (!exists)
      return res.status(404).json({ message: "Not Found", status: false });

    const patch = {
      groupName: req.body.groupName ?? exists.groupName,
      groupDesc: req.body.groupDesc ?? exists.groupDesc,
      permissions: Array.isArray(req.body.permissions)
        ? req.body.permissions
        : exists.permissions,
      status: req.body.status ?? exists.status,
    };

    await GroupBundle.findByIdAndUpdate(req.params.id, patch, {
      new: true,
      runValidators: true,
    });
    return res
      .status(200)
      .json({ message: "updated successfull", status: true });
  } catch (err) {
    console.error(err);
    const dup =
      err?.code === 11000
        ? "Group name already exists"
        : "Internal Server Error";
    return res.status(500).json({ error: dup, status: false });
  }
};
