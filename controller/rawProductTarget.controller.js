import { RawProductTarget } from "../model/rawProductTarget.model.js";

export const saveTarget = async (req, res, next) => {
  try {
    const target = await RawProductTarget.create(req.body);
    return target
      ? res.status(200).json({ message: "Data Added", status: true })
      : res
          .status(404)
          .json({ message: "Something went Wrong", status: false });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const viewAllTarget = async (req, res, next) => {
  try {
    const { database } = req.params;
    const target = await RawProductTarget.find({ database });
    return target.length > 0
      ? res.status(200).json({ message: "Data Found", target, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const viewByIdTarget = async (req, res, next) => {
  try {
    const { id, innerId } = req.params;
    const target = await RawProductTarget.findById(id).sort({ sortorder: -1 });
    if (target) {
      const findData = target.Target.find(
        (item) => item._id.toString() === innerId
      );
      // const findData = target.Target.id(innerId);
      res
        .status(200)
        .json({ message: "Data Found", targets: findData, status: true });
    } else {
      return res.status(404).json({ message: "Not Found", status: false });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const updateTarget = async (req, res, next) => {
  try {
    const { id, innerId } = req.params;
    const existingProduct = await RawProductTarget.findById(id);
    if (existingProduct) {
      const findIndex = existingProduct.Target.findIndex(
        (item) => item._id.toString() === innerId
      );
      if (findIndex !== -1) {
        existingProduct.Target[findIndex] = {
          ...existingProduct.Target[findIndex]._doc,
          ...req.body,
        };
        await existingProduct.save();
        return res
          .status(200)
          .json({ message: "Data Updated Successfully", status: true });
      } else {
        return res
          .status(404)
          .json({ error: "Inner Data Not Found", status: false });
      }
    } else {
      return res.status(404).json({ error: "Not Found", status: false });
    }
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const deleteTarget = async (req, res, next) => {
  try {
    const { id, innerId } = req.params;
    const existingProduct = await RawProductTarget.findById(id);
    if (existingProduct) {
      const findIndex = existingProduct.Target.findIndex(
        (item) => item._id.toString() !== innerId
      );
      if (findIndex !== -1) {
        existingProduct.Target.splice(findIndex, 1);
        await existingProduct.save();
        if (existingProduct.Target.length === 0) {
          await RawProductTarget.findByIdAndDelete(id);
          return res.status(200).json({
            message: "Parent data deleted because no product remain",
            status: true,
          });
        }
        return res
          .status(200)
          .json({ message: "Inner data deleted successfully", status: true });
      } else {
        return res
          .status(404)
          .json({ error: "Inner data not found", status: false });
      }
    } else {
      return res
        .status(404)
        .json({ error: "Parent data not found", status: false });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

// export const viewLedgerByPartySalesApp = async (req, res, next) => {
//   try {
//     const customer = await Customer.find({ created_by: req.params.id });
//     if (customer.length === 0) {
//       return res
//         .status(404)
//         .json({ message: "Customer Not Found", status: false });
//     }
//     let ledgerData = [];
//     for (let items of customer) {
//       let totalBillAmount = 0;
//       let totalReceipt = 0;
//       const ledger = await Ledger.find({ partyId: items._id })
//         .sort({ date: 1, sortorder: -1 })
//         .populate({ path: "partyId", model: "customer" });
//       if (ledger.length === 0) {
//         console.log("party ledger not found");
//       }
//       for (let item of ledger) {
//         const existingLedger = await ledgerData.find(
//           (i) => i.partyId._id.toString() === item.partyId._id.toString()
//         );
//         if (existingLedger) {
//           if (item.debit) {
//             existingLedger.totalBillAmount += item.debit;
//           } else {
//             existingLedger.totalReceipt += item.credit;
//           }
//         } else {
//           if (item.debit) {
//             totalBillAmount = item.debit;
//           } else {
//             totalReceipt = item.credit;
//           }
//           const obj = {
//             partyId: items,
//             totalBillAmount: totalBillAmount,
//             totalReceipt: totalReceipt,
//           };
//           ledgerData.push(obj);
//         }
//       }
//     }
//     return res.status(200).json({ Ledger: ledgerData, status: true });
//   } catch (err) {
//     console.error(err);
//     return res
//       .status(500)
//       .json({ error: "Internal Server Error", status: false });
//   }
// };
