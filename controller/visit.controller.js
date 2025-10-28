import { Visit } from "../model/visit.model.js";

export const createVisit = async (req, res, next) => {
    try {
        const visit = await Visit.create(req.body);
        return visit ? res.status(200).json({ message: "Data Added", status: true }) : res.status(400).json({ message: "Something went wrong", status: false })
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal Server Error", status: false })
    }
}

export const viewVisit = async (req, res, next) => {
    try {
        const { id, database } = req.params;
        console.log(req.params)
        const visit = await Visit.find({ created_by: id,database:database});
        return visit.length > 0 ? res.status(200).json({ message: "Data Found", visit, status: true }) : res.status(400).json({ message: "Not Found", status: false })
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Internal Server Error", status: false })
    }
}