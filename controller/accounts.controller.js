import { Account } from "../model/accounts.model.js";

export const savedAccount = async (req, res, next) => {
    try {
        const { database, created_by, Accounts } = req.body;
        const findAccounts = await Account.findOne({ database: database, created_by: created_by })
        if (findAccounts) {
            Accounts.forEach(item => {
                findAccounts.Accounts.push(item)
            });
            await findAccounts.save();
            return res.status(200).json({ message: "Account saved", status: true })
        } else {
            const savedAccount = await Account.create(req.body);
            return savedAccount ? res.status(200).json({ message: "Data Saved", status: true }) : res.status(404).json({ message: "Somethings Went Wrong", status: false })
        }
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}

export const viewAccount = async (req, res, next) => {
    try {
        const viewAccounts = await Account.findOne({ database: req.params.database })
        return viewAccounts? res.status(200).json({ message: "Data Found", viewAccounts, status: true }) : res.status(404).json({ message: "Not Found", status: false })
    } catch (error) {
        console.log(error)
        return res.status(500).json({ message: "Internal Server Error", error: error.message, status: false })
    }
}

export const deleteAccount = async (req, res, next) => {
    try {
        const { id, innerId } = req.params;
        const account = await Account.findById(id);
        if (!account) {
            return res.status(404).json({ message: "Not Found Account", status: false });
        }
        const accountLength = account.Accounts.length;
        account.Accounts = account.Accounts.filter(
            (item) => item._id.toString() !== innerId
        );
        if (account.Accounts.length === accountLength) {
            return res.status(404).json({ message: "Account not found", status: false });
        }
        await account.save();
        res.status(200).json({ message: "Account Deleted", status: true });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            message: "Internal Server Error",
            error: error.message,
            status: false
        });
    }
};