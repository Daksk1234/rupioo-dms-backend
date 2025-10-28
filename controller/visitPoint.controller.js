import { VisitPoint } from "../model/visitPoint.model.js";
export const createVisitPoint = async (req, res, next) => {
    try {
        const visit = await VisitPoint.create(req.body);
        return visit ? res.status(200).json({ message: "Data Added", status: true }) : res.status(400).json({ message: "Something went wrong", status: false })
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal Server Error", status: false })
    }
}

export const viewVisitPoint = async (req, res, next) => {
    try {
        const { id, date } = req.params;
        const visitPoint = await VisitPoint.find({ userId: id, date: date });
        return visitPoint.length > 0 ? res.status(200).json({ message: "Data Found", visitPoint, status: true }) : res.status(400).json({ message: "Not Found", status: false })
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal Server Error", status: false })
    }
}

export const updateVisitPoint = async (req, res, next) => {
    try {
        const { id } = req.params;
        const visitPoint = await VisitPoint.findById(id);
        if (!visitPoint) {
            return res.status(404).json({ message: "Not Found", status: false })
        }
        const updateData = req.body;
        await VisitPoint.findByIdAndUpdate(id, updateData, { new: true });
        return res.status(200).json({ message: "Data Updated", status: true })
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal Server Error", status: false })
    }
}