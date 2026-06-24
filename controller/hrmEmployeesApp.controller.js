import HrmEmployeesApp from "../model/hrmEmployeesApp.model.js";

function safeText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function onlyDigits(value) {
  return safeText(value).replace(/\D/g, "");
}

function cleanPan(value) {
  return safeText(value).toUpperCase();
}

function employeePayload(body = {}) {
  return {
    database: safeText(body.database),
    created_by: safeText(body.created_by || body.createdBy),
    name: safeText(body.name),
    address: safeText(body.address),
    dob: safeText(body.dob),
    mobile: onlyDigits(body.mobile || body.mobileNumber),
    pan: cleanPan(body.pan || body.panNumber),
    aadhar: onlyDigits(body.aadhar || body.aadharNumber),
    pincode: onlyDigits(body.pincode),
    designation: safeText(body.designation),
    salary: safeText(body.salary),
    shiftId: safeText(body.shiftId),
    photoUri: safeText(body.photoUri),
    photoUrl: safeText(body.photoUrl),
    faceId: safeText(body.faceId),
    faceRegistered:
      body.faceRegistered === true ||
      body.faceRegistered === "true" ||
      !!safeText(body.faceId),
    status: safeText(body.status) || "Active",
    raw: body.raw || {},
  };
}

function sendError(res, error, fallback = "Something went wrong") {
  const code = error?.code === 11000 ? 409 : 500;

  return res.status(code).json({
    status: false,
    message:
      error?.code === 11000
        ? "Employee with same PAN or Aadhaar already exists."
        : error?.message || fallback,
  });
}

export const createHrmEmployeeApp = async (req, res) => {
  try {
    const payload = employeePayload(req.body);

    if (!payload.database) {
      return res.status(400).json({
        status: false,
        message: "database is required.",
      });
    }

    if (!payload.name) {
      return res.status(400).json({
        status: false,
        message: "Employee name is required.",
      });
    }

    const employee = await HrmEmployeesApp.create(payload);

    return res.status(201).json({
      status: true,
      message: "Employee created successfully.",
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to create employee.");
  }
};

export const viewHrmEmployeesApp = async (req, res) => {
  try {
    const database = safeText(req.params.database || req.query.database);

    if (!database) {
      return res.status(400).json({
        status: false,
        message: "database is required.",
      });
    }

    const employees = await HrmEmployeesApp.find({ database })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      status: true,
      data: employees,
      employees,
      total: employees.length,
    });
  } catch (error) {
    return sendError(res, error, "Unable to fetch employees.");
  }
};

export const viewHrmEmployeeAppById = async (req, res) => {
  try {
    const employee = await HrmEmployeesApp.findById(req.params.id).lean();

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      status: true,
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to fetch employee.");
  }
};

export const updateHrmEmployeeApp = async (req, res) => {
  try {
    const payload = employeePayload(req.body);
    delete payload.database;

    const employee = await HrmEmployeesApp.findByIdAndUpdate(
      req.params.id,
      payload,
      { new: true, runValidators: true },
    );

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Employee updated successfully.",
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to update employee.");
  }
};

export const markHrmEmployeeFaceRegistered = async (req, res) => {
  try {
    const employee = await HrmEmployeesApp.findByIdAndUpdate(
      req.params.id,
      {
        faceId: safeText(req.body.faceId),
        faceRegistered: true,
        photoUri: safeText(req.body.photoUri),
        photoUrl: safeText(req.body.photoUrl),
      },
      { new: true },
    );

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Employee face registration updated.",
      data: employee,
      employee,
    });
  } catch (error) {
    return sendError(res, error, "Unable to update face registration.");
  }
};

export const deleteHrmEmployeeApp = async (req, res) => {
  try {
    const employee = await HrmEmployeesApp.findByIdAndDelete(req.params.id);

    if (!employee) {
      return res.status(404).json({
        status: false,
        message: "Employee not found.",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Employee deleted successfully.",
    });
  } catch (error) {
    return sendError(res, error, "Unable to delete employee.");
  }
};
