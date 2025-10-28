import { EmergencyInvoice } from "../model/emergencyInvoice.model.js";

export const saveEmergencyInvoice = async (req, res, next) => {
    try {
        const { partyId } = req.body;
        if (!partyId) {
            return res.json({ message: "Party Id Is Required", status: false })
        }
        const invoiceData = await EmergencyInvoice.find({ partyId: req.body.partyId, status: "Pending" })
        if (invoiceData && invoiceData.length > 0) {
            return res.json({ message: "Already Processed Your Emergency Invoice Request ", status: false })
        }
        const savedInvoice = await EmergencyInvoice.create(req.body);
        return savedInvoice ? res.status(200).json({ message: "Data Saved", status: true }) : res.status(404).json({ message: "Something Went Wrong", status: false })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}

export const viewEmergencyInvoice = async (req, res, next) => {
    try {
        const emergencyInvoice = await EmergencyInvoice.find({ database: req.params.database }).populate({ path: "partyId", model: "customer" })
        return emergencyInvoice.length > 0 ? res.status(200).json({ message: "Data Found", emergencyInvoice, status: true }) : res.status(404).json({ message: "Not Found", status: false })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}

export const updateEmergencyInvoice = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        if(!req.body.partyId){
            return res.json({ message: "Party Id Is Required", status: false })
        }
        const emergencyInvoice = await EmergencyInvoice.findById(id)
        if (!emergencyInvoice) {
            return res.status(404).json({ message: "Not Found", status: false })
        }
        await EmergencyInvoice.findByIdAndUpdate(id, updatedData, { new: true })
        res.status(200).json({ message: "Status Updated", status: true })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}