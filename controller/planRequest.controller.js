import { PlanRequest } from "../model/planRequest.model.js";
import { Subscription } from "../model/subscription.model.js";
import { User } from "../model/user.model.js";

export const addPlan = async (req, res, next) => {
    try {
        if (req.file) {
            req.body.paymentImg = req.file.filename;
        }
        const plan = await PlanRequest.create(req.body);
        return plan ? res.status(200).json({ message: "Request Added", status: true }) : res.status(404).json({ message: "Something Went Wrong", status: false })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}

export const viewPlan = async (req, res, next) => {
    try {
        const plan = await PlanRequest.find({}).populate({ path: "plan", model: "subscription" }).populate({ path: "superAdmin", model: "user" });
        return plan.length > 0 ? res.status(200).json({ message: "Data Found", plan, status: true }) : res.status(404).json({ message: "Not Found", status: false })
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}

export const updatePlan = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updatedData = req.body;
        const existingPlan = await PlanRequest.findById(id);

        if (!existingPlan) {
            return res.status(404).json({ message: "Not Found", status: false });
        }

        if (req.body.status === "Approved" && existingPlan.status === "Pending") {
            const user = await User.findById(existingPlan.superAdmin);

            if (user) {
                const sub = await Subscription.findById({ _id: existingPlan.plan });

                if (sub) {
                    const date = new Date();
                    user.planStart = date;
                    user.planEnd = new Date(date.getTime() + (sub.days * 24 * 60 * 60 * 1000));
                    user.billAmount = sub.subscriptionCost;
                    user.userAllotted = sub.noOfUser;
                    user.subscriptionPlan = existingPlan.plan;
                    await user.save();
                }
            }

            await PlanRequest.findByIdAndUpdate(id, updatedData, { new: true });
            res.status(200).json({ message: "Status Updated", status: true });

        } else if (req.body.status === "Rejected" && existingPlan.status === "Pending") {
            await PlanRequest.findByIdAndUpdate(id, updatedData, { new: true });
            res.status(200).json({ message: "Status Updated", status: true });

        } else {
            return res.json({ message: "Request Already Processed", status: false });
        }

    } catch (error) {
        console.error("Error updating plan:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message, status: false });
    }
}
