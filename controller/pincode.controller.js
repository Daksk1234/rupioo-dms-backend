import { Pincode } from "../model/pincode.model.js";
import ExcelJS from 'exceljs';
import fs from 'fs';

export const saveExcelPincode = async (req, res, next) => {
    const filePath = req.file?.path;
    try {
        if (!filePath) {
            return res.status(400).json({ message: "No Excel file uploaded", status: false });
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
                rowData[heading] = typeof value === 'object' && value?.text ? value.text : value;
            });
            if (rowData.pincode) {
                bulkData.push(rowData);
            }
        }

        if (bulkData.length === 0) {
            return res.status(400).json({ message: "No valid data found in Excel", status: false });
        }

        await Pincode.insertMany(bulkData);

        // fs.unlinkSync(filePath);

        return res.status(200).json({ message: "Pincode data added successfully", status: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Something went wrong during Excel import",
            error: error.message,
            status: false
        });
    }
};

export const viewPincode = async (req, res, next) => {
    try {
        const pinCodeList = await Pincode.find();
        return pinCodeList.length > 0 ? res.status(200).json({ message: "Data Found", status: true, pinCodeList }) : res.status(404).json({ message: "Something Went Wrong", status: false })
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false
        });
    }
}

export const updatePincode = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { pincode } = req.body;
        const updatedPincode = await Pincode.findByIdAndUpdate(id, { pincode }, { new: true });
        return updatedPincode ? res.status(200).json({ message: "Pincode updated successfully", status: true }) : res.status(404).json({ message: "Not Found", status: false })
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false
        });
    }
}

export const deletePindcode = async (req, res, next) => {
    try {
        const { id } = req.params
        const pincode = await Pincode.findByIdAndDelete(id)
        return pincode ? res.status(200).json({ message: "Data Deleted", status: true }) : res.status(404).json({ message: "Not Found", status: false })
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false
        });
    }
}

export const bulkDeletePincode = async (req, res, next) => {
    try {
        const { pinCodeList } = req.body;
        if (pinCodeList.length > 0) {
            for (let item of pinCodeList) {
                await Pincode.findByIdAndDelete(item.id);
            }
            return res.status(200).json({ message: "Data Deleted", status: true })
        } else {
            return res.status(404).json({ message: "Invalid Data", status: false })
        }
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false
        });
    }
}