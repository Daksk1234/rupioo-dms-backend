import { Pincode } from "../model/pincode.model.js";
import ExcelJS from "exceljs";

import fs from "fs";

export const saveExcelPincode = async (req, res, next) => {
  const filePath = req.file?.path;
  try {
    if (!filePath) {
      return res
        .status(400)
        .json({ message: "No Excel file uploaded", status: false });
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.getWorksheet(1);
    const headerRow = worksheet.getRow(1);
    const headings = headerRow.values.slice(1);

    const bulkData = [];

    for (let rowIndex = 2; rowIndex <= worksheet.actualRowCount; rowIndex++) {
      const row = worksheet.getRow(rowIndex);
      const rowData = {};

      headings.forEach((heading, i) => {
        const cell = row.getCell(i + 1);
        const value = cell.value;
        rowData[heading] =
          typeof value === "object" && value?.text ? value.text : value;
      });
      if (rowData.pincode) {
        bulkData.push(rowData);
      }
    }

    if (bulkData.length === 0) {
      return res
        .status(400)
        .json({ message: "No valid data found in Excel", status: false });
    }

    await Pincode.insertMany(bulkData);

    // fs.unlinkSync(filePath);

    return res
      .status(200)
      .json({ message: "Pincode data added successfully", status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Something went wrong during Excel import",
      error: error.message,
      status: false,
    });
  }
};

export const viewPincodes = async (req, res) => {
  try {
    const { pincode } = req.query;

    if (!pincode) {
      return res.status(400).json({
        message: "Pincode is required",
        status: false,
      });
    }

    const pinCodes = await Pincode.find({ pincode }).lean();

    if (pinCodes.length === 0) {
      return res.status(404).json({
        message: "No Data Found",
        status: false,
      });
    }

    return res.status(200).json({
      message: "Data Found",
      status: true,
      pinCodes,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};

export const getAllStates = async (req, res) => {
  try {
    // distinct gives unique values
    let states = await Pincode.distinct("state");

    // cleanup: remove empty/null, trim, unique after trim, sort
    states = (states || [])
      .map((s) => (s || "").toString().trim())
      .filter(Boolean);

    // ensure unique after trim + sort A-Z
    states = Array.from(new Set(states)).sort((a, b) => a.localeCompare(b));

    return res.status(200).json({
      message: "Data Found",
      status: true,
      totalRecords: states.length,
      states,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const viewPincodeByState = async (req, res) => {
  try {
    const state = (req.query.state || "").trim();

    if (!state) {
      return res.status(400).json({
        message: "state is required",
        status: false,
      });
    }

    // exact state match (case-insensitive)
    const query = { state: { $regex: `^${state}$`, $options: "i" } };

    const pinDocs = await Pincode.find(query)
      .select("pincode city district state")
      .sort({ pincode: 1 })
      .lean();

    const pincodes = pinDocs.map((x) => x?.pincode).filter(Boolean);

    return res.status(200).json({
      message: "Data Found",
      status: true,
      state,
      totalRecords: pinDocs.length,
      pincodes, // ✅ only pincodes array
      pinCodeList: pinDocs, // ✅ optional full list (remove if you want only pincodes)
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const viewPincode = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    const search = req.query.search || "";

    const query = search
      ? {
          $or: [
            { pincode: { $regex: search, $options: "i" } },
            { city: { $regex: search, $options: "i" } },
            { state: { $regex: search, $options: "i" } },
            { district: { $regex: search, $options: "i" } },
          ],
        }
      : {};

    const [pinCodeList, total] = await Promise.all([
      Pincode.find(query).skip(skip).limit(limit),
      Pincode.countDocuments(query),
    ]);

    return res.status(200).json({
      message: "Data Found",
      status: true,
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalRecords: total,
      limit: limit,
      pinCodeList,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const updatePincode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { pincode } = req.body;
    const updatedPincode = await Pincode.findByIdAndUpdate(
      id,
      { pincode },
      { new: true },
    );
    return updatedPincode
      ? res
          .status(200)
          .json({ message: "Pincode updated successfully", status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const deletePindcode = async (req, res, next) => {
  try {
    const { id } = req.params;
    const pincode = await Pincode.findByIdAndDelete(id);
    return pincode
      ? res.status(200).json({ message: "Data Deleted", status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};

export const bulkDeletePincode = async (req, res, next) => {
  try {
    const { pinCodeList } = req.body;
    if (pinCodeList.length > 0) {
      for (let item of pinCodeList) {
        await Pincode.findByIdAndDelete(item.id);
      }
      return res.status(200).json({ message: "Data Deleted", status: true });
    } else {
      return res.status(404).json({ message: "Invalid Data", status: false });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
      status: false,
    });
  }
};
