import { DynamicUnit } from "../model/dynamicUnit.model.js";

export const saveDynamicUnit = async (req, res, next) => {
    try {
        const { database, created_by, Units } = req.body;
        const findUnits = await DynamicUnit.findOne({ database: database, created_by: created_by })

        if (findUnits) {
            Units.forEach(item => {
                findUnits.Units.push(item)
            });

            await findUnits.save();
            return res.status(200).json({ message: "Unit saved", status: true })
        } else {
            const savedUnits = await DynamicUnit.create(req.body);
            return savedUnits ? res.status(200).json({ message: "Data Saved", status: true }) : res.status(404).json({ message: "Somethings Went Wrong", status: false })
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}

export const viewDynamicUnit = async (req, res, next) => {
    try {
        const dynamicUnit = await DynamicUnit.findOne({ database: req.params.database })
        return dynamicUnit? res.status(200).json({ message: "Data Found", dynamicUnit, status: true }) : res.status(404).json({ message: "Not Found", status: false })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}


export const deleteDynamicUnit = async (req, res, next) => {
    try {
        const { id, innerId } = req.params;

        const dynamicUnit = await DynamicUnit.findById(id);
        if (!dynamicUnit) {
            return res.status(404).json({ message: "Not Found SuperAdmin Units", status: false });
        }

        const originalLength = dynamicUnit.Units.length;
        dynamicUnit.Units = dynamicUnit.Units.filter(
            (item) => item._id.toString() !== innerId
        );

        if (dynamicUnit.Units.length === originalLength) {
            return res.status(404).json({ message: "Unit not found", status: false });
        }

        await dynamicUnit.save();

        res.status(200).json({ message: "Unit Deleted", status: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false
        });
    }
};