import { Activity } from "../model/createActivity.model.js";
import { CreateOrder } from "../model/createOrder.model.js";
import { Customer } from "../model/customer.model.js";
import { Promotion } from "../model/promotion.model.js";
import { User } from "../model/user.model.js";
import { getUserHierarchyBottomToTop } from "../rolePermission/RolePermission.js";

export const SaveActivity = async (req, res, next) => {
  try {
    const existingActivity = await Activity.find({ status: "Active" }).sort({
      sortorder: -1,
    });
    if (existingActivity.length === 0) {
      const no = 1;
      req.body.Code = `PA24-25${no.toString().padStart(4, "0")}`;
    } else {
      const existCode = existingActivity[existingActivity.length - 1].Code;
      const latestCode = parseInt(existCode.slice(7)) + 1;
      const paddedCode = latestCode.toString().padStart(4, "0");
      req.body.Code = `PA24-25${paddedCode}`;
    }
    const newActivity = await Activity.create(req.body);
    return newActivity
      ? res.status(200).json({ message: "Save Successfull", status: true })
      : res
          .status(400)
          .json({ message: "Something Went Wrong", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};
export const ViewActivity = async (req, res, next) => {
  try {
    const database = req.params.database;
    const activity = await Activity.find({
      database: database,
      status: "Active",
    }).sort({ sortorder: -1 });
    return activity.length > 0
      ? res.status(200).json({ Activity: activity, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewActivityById = async (req, res, next) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res
        .status(404)
        .json({ message: "Activity No found", status: false });
    }
    return res.status(200).json({ Activity: activity, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const UpdatedActivity = async (req, res, next) => {
  try {
    const id = req.params.id;
    const activity = await Activity.findById(id);
    if (!activity) {
      return res
        .status(404)
        .json({ message: "Activity No Found", status: false });
    }
    const udpatedDate = req.body;
    req.body.Code = undefined;
    await Activity.findByIdAndUpdate(id, udpatedDate, { new: true });
    return res
      .status(200)
      .json({ message: "activity updated successfull", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const deleteActivity = async (req, res, next) => {
  try {
    const activity = await Activity.findById(req.params.id);
    if (!activity) {
      return res
        .status(404)
        .json({ message: "Activity Not Found", status: false });
    }
    activity.status = "Deactive";
    await activity.save();
    return res
      .status(200)
      .json({ message: "activity delete successfull", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const SavePromotion = async (req, res, next) => {
  try {
    const user = await User.findById({ _id: req.body.created_by });
    if (!user) {
      return res.status(400).json({ message: "User Not Found", status: false });
    }
    req.body.database = user.database;
    const promotion = await Promotion.create(req.body);
    return promotion
      ? res.status(200).json({ Promotion: promotion, status: true })
      : res
          .status(400)
          .json({ message: "Something Went Wrong", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewPromotion = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const database = req.params.database;
    // const adminDetail = await getUserHierarchyBottomToTop(userId, database)
    // if (!adminDetail.length > 0) {
    //     return res.status(404).json({ error: "Product Not Found", status: false })
    // }
    const promotion = await Promotion.find({
      database: database,
      status: "Active",
    })
      .populate({ path: "activityId", model: "activity" })
      .sort({ sortorder: -1 });
    return promotion.length > 0
      ? res.status(200).json({ Promotion: promotion, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewPromotionById = async (req, res, next) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res
        .status(404)
        .json({ message: "Promotion No found", status: false });
    }
    return res.status(200).json({ Promotion: promotion, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const UpdatedPromotion = async (req, res, next) => {
  try {
    const id = req.params.id;
    const promotion = await Promotion.findById(id);
    if (!promotion) {
      return res
        .status(404)
        .json({ message: "Promotion No Found", status: false });
    }
    const udpatedDate = req.body;
    await Promotion.findByIdAndUpdate(id, udpatedDate, { new: true });
    return res
      .status(200)
      .json({ message: "promotion updated successfull", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const deletePromotion = async (req, res, next) => {
  try {
    const promotion = await Promotion.findById(req.params.id);
    if (!promotion) {
      return res
        .status(404)
        .json({ message: "Promotion Not Found", status: false });
    }
    promotion.status = "Deactive";
    await promotion.save();
    return res
      .status(200)
      .json({ message: "promotion delete successfull", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const UpdatedPromotionProductWise = async (req, res, next) => {
  try {
    const id = req.params.id;
    const promotion = await Promotion.findOne({ "productWise._id": id });
    if (!promotion) {
      return res
        .status(404)
        .json({ message: "Promotion Not Found", status: false });
    }
    promotion.activityId = (await req.body.activityId) || promotion.activityId;
    for (let item of promotion.productWise) {
      if (item._id.toString() === id) {
        item.productId = req.body.productId || item.productId;
        item.targetQty = req.body.targetQty || item.targetQty;
        item.freeProductQty = req.body.freeProductQty || item.freeProductQty;
        item.freeProduct = req.body.freeProduct || item.freeProduct;
        item.discountPercentage =
          req.body.discountPercentage || item.discountPercentage;
        item.discountAmount = req.body.discountAmount || item.discountAmount;
      }
    }
    await promotion.save();
    return res
      .status(200)
      .json({ message: "Promotion updated successfully", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const PromotionApply = async (req, res, next) => {
  try {
    const customers = [];

    const existPromotion = await Promotion.find({
      database: req.params.database,
      status: "Active",
    })
      .populate({ path: "activityId", model: "activity" })
      .populate({ path: "productWise.freeProduct", model: "product" });

    if (existPromotion.length === 0) {
      return res
        .status(404)
        .json({ message: "Promotion Not Found", status: false });
    }

    for (const promo of existPromotion) {
      // Guard: some promos may have missing activity (deleted)
      if (!promo?.activityId?.FromDate || !promo?.activityId?.ToDate) continue;

      const startOfDay = new Date(promo.activityId.FromDate);
      const endOfDay = new Date(promo.activityId.ToDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      endOfDay.setUTCHours(23, 59, 59, 999);

      const customersList = await Customer.find({
        status: "Active",
        database: req.params.database,
      }).populate({ path: "created_by", model: "user" });

      if (customersList.length === 0) {
        continue; // no customers -> nothing to compute
      }

      for (const cust of customersList) {
        let totalAmount = 0;
        let party = cust;

        const orders = await CreateOrder.find({
          partyId: cust._id.toString(),
          status: "completed",
          date: { $gte: startOfDay, $lte: endOfDay },
        })
          .populate({ path: "partyId", model: "customer" })
          .populate({ path: "orderItems.productId", model: "product" });

        if (orders.length === 0) continue;

        // aggregate amounts/lines
        let productItems = [];
        for (const o of orders) {
          // NOTE: your model uses both `amount` and `grandTotal` in different places.
          // Prefer `amount` if present, else fallback to `grandTotal`.
          totalAmount += Number(o.amount ?? o.grandTotal ?? 0);
          if (Array.isArray(o.orderItems))
            productItems = productItems.concat(o.orderItems);
        }

        const productWise = Array.isArray(promo.productWise)
          ? promo.productWise
          : [];
        const amountWise = Array.isArray(promo.amountWise)
          ? promo.amountWise
          : [];
        const percentageWise = Array.isArray(promo.percentageWise)
          ? promo.percentageWise
          : [];

        if (productWise.length > 0) {
          for (const line of productWise) {
            let totalProductQty = 0;
            let offerQty = 0;
            let status = "Pending";
            let AchieveQty = 0;
            let remainingQty = 0;
            let productName = "";
            let freeProductName = "";

            // Safely compare product ids
            const targetPid = line?.productId ? String(line.productId) : null;

            for (const oi of productItems) {
              const oiPid = oi?.productId?._id
                ? String(oi.productId._id)
                : null;
              if (oiPid && targetPid && oiPid === targetPid) {
                totalProductQty += Number(oi?.qty ?? 0);
                // keep a readable name if present
                productName = oi?.productId?.Product_Title || productName;
              }
            }

            if (Number(line?.targetQty ?? 0) <= totalProductQty) {
              AchieveQty = totalProductQty;
              const noToMultiple = Math.floor(
                totalProductQty / Number(line.targetQty || 1)
              );
              if (line?.freeProductQty) {
                offerQty = `${Number(line.freeProductQty) * noToMultiple} qty`;
                freeProductName = line?.freeProduct?.Product_Title || "";
              } else if (line?.discountPercentage) {
                offerQty = `${Number(line.discountPercentage)}%`;
              } else if (line?.discountAmount) {
                offerQty = `₹${Number(line.discountAmount) * noToMultiple}`;
              } else {
                offerQty = `—`;
              }
              status = noToMultiple; // your original semantics
            } else {
              AchieveQty = totalProductQty;
              remainingQty = Number(line?.targetQty ?? 0) - totalProductQty;
            }

            const Obj = {
              partyId: party,
              productName,
              Target: `${Number(line?.targetQty ?? 0)} qty`,
              Achieved: AchieveQty,
              Balance: remainingQty,
              Status: status,
              OfferAmount: offerQty,
              FreeProduct: freeProductName,
              type: "ProductWise",
              ActivityType: promo.activityId,
            };

            if (productName) customers.push(Obj);
          }
        } else if (amountWise.length > 0) {
          let remainingAmount = 0;
          let status = "Pending";
          let offerAmount = 0;
          const slab = amountWise[0];

          if (Number(slab?.totalAmount ?? 0) <= totalAmount) {
            const noToMultiple = Math.floor(
              totalAmount / Number(slab.totalAmount || 1)
            );
            remainingAmount = 0;
            status = noToMultiple;
            offerAmount = `₹${
              Number(slab?.percentageAmount ?? 0) * noToMultiple
            }`;
          } else {
            remainingAmount = Number(slab?.totalAmount ?? 0) - totalAmount;
          }

          customers.push({
            partyId: party,
            Target: "₹" + Number(slab?.totalAmount ?? 0),
            Achieved: totalAmount,
            Balance: remainingAmount,
            Status: status,
            OfferAmount: offerAmount,
            type: "AmountWise",
            ActivityType: promo.activityId,
          });
        } else if (percentageWise.length > 0) {
          let remainingAmount = 0;
          let status = "Pending";
          let offerPercentageAmount = 0;
          const slab = percentageWise[0];

          if (Number(slab?.totalAmount ?? 0) <= totalAmount) {
            const noToMultiple = Math.floor(
              totalAmount / Number(slab.totalAmount || 1)
            );
            remainingAmount = 0;
            status = noToMultiple;

            const discountPerSlab =
              (Number(slab.totalAmount || 0) *
                Number(slab?.percentageDiscount || 0)) /
              100;
            offerPercentageAmount = discountPerSlab * noToMultiple;
          } else {
            remainingAmount = Number(slab?.totalAmount ?? 0) - totalAmount;
          }

          customers.push({
            partyId: party,
            Target: "₹" + Number(slab?.totalAmount ?? 0),
            Achieved: totalAmount,
            Balance: remainingAmount,
            Status: status,
            OfferAmount: offerPercentageAmount,
            type: "PercentageWise",
            ActivityType: promo.activityId,
          });
        }
      }
    }

    return res
      .status(200)
      .json({ Promotion: customers, messge: "success", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};
export const PromotionApplySalesApp = async (req, res, next) => {
  try {
    const customers = [];
    const existPromotion = await Promotion.find({
      database: req.params.database,
      status: "Active",
    })
      .populate({ path: "activityId", model: "activity" })
      .populate({ path: "productWise.freeProduct", model: "product" });
    if (existPromotion.length === 0) {
      return res
        .status(404)
        .json({ message: "Promotion Not Found", status: false });
    }
    for (let item of existPromotion) {
      const startOfDay = new Date(item.activityId.FromDate);
      const endOfDay = new Date(item.activityId.ToDate);
      startOfDay.setUTCHours(0, 0, 0, 0);
      endOfDay.setUTCHours(23, 59, 59, 999);
      const customer = await Customer.find({
        created_by: req.params.id,
        status: "Active",
      }).populate({ path: "created_by", model: "user" });
      if (customer.length === 0) {
        return res
          .status(404)
          .json({ message: "Party Not Found", status: false });
      }
      for (let id of customer) {
        let totalAmount = 0;
        let totalQty = 0;
        let party = {};
        const existOrder = await CreateOrder.find({
          partyId: id._id.toString(),
          status: "completed",
          date: { $gte: startOfDay, $lte: endOfDay },
        })
          .populate({ path: "partyId", model: "customer" })
          .populate({ path: "orderItems.productId", model: "product" });
        if (existOrder.length === 0) {
          continue;
        } else {
          for (let item of existOrder) {
            totalAmount += item.grandTotal;
            totalQty += item.qty;
            party = id;
          }
          if (item.productWise.length > 0) {
            let productItems = [];
            for (let item of existOrder) {
              productItems = productItems.concat(item.orderItems);
            }
            for (let items of item.productWise) {
              let totalProductQty = 0;
              let offerQty = 0;
              let status = "Pending";
              let AchieveQty = 0;
              let remainingQty = 0;
              let productName = "";
              let freeProductName = "";
              productItems.forEach((item) => {
                if (
                  item.productId._id.toString() === items.productId.toString()
                ) {
                  totalProductQty += item.qty;
                  productName = item.productId.Product_Title;
                }
              });
              if (items.targetQty < totalProductQty) {
                AchieveQty = totalProductQty;
                if (items.freeProductQty) {
                  offerQty = `${items.freeProductQty} qty`;
                  freeProductName = items.freeProduct.Product_Title;
                } else if (items.discountPercentage) {
                  offerQty = `${items.discountPercentage}%`;
                } else {
                  offerQty = `₹${items.discountAmount}`;
                }
                status = "Completed";
              } else {
                AchieveQty = totalProductQty;
                remainingQty = items.targetQty - totalProductQty;
              }
              let Obj = {
                partyId: party,
                productName: productName,
                Target: items.targetQty + " qty",
                Achieved: AchieveQty,
                Balance: remainingQty,
                Status: status,
                OfferAmount: offerQty,
                FreeProduct: freeProductName,
                type: "ProductWise",
                ActivityType: item.activityId,
              };
              if (productName) {
                await customers.push(Obj);
              }
            }
          } else if (item.amountWise.length > 0) {
            let remainingAmount = 0;
            let status = "Pending";
            let offerAmount = 0;
            if (item.amountWise[0].totalAmount <= totalAmount) {
              remainingAmount = 0;
              status = "Completed";
              offerAmount = `₹${item.amountWise[0].percentageAmount}`;
            } else {
              remainingAmount = item.amountWise[0].totalAmount - totalAmount;
            }
            let Obj = {
              partyId: party,
              Target: "₹" + item.amountWise[0].totalAmount,
              Achieved: totalAmount,
              Balance: remainingAmount,
              Status: status,
              OfferAmount: offerAmount,
              type: "AmountWise",
              ActivityType: item.activityId,
            };
            await customers.push(Obj);
          } else if (item.percentageWise.length > 0) {
            let remainingAmount = 0;
            let status = "Pending";
            let offerPercentage = 0;
            if (item.percentageWise[0].totalAmount <= totalAmount) {
              remainingAmount = 0;
              status = "Completed";
              offerPercentage = `${item.percentageWise[0].percentageDiscount}%`;
            } else {
              remainingAmount =
                item.percentageWise[0].totalAmount - totalAmount;
            }
            let Obj = {
              partyId: party,
              Target: "₹" + item.percentageWise[0].totalAmount,
              Achieved: totalAmount,
              Balance: remainingAmount,
              Status: status,
              OfferAmount: offerPercentage,
              type: "PercentageWise",
              ActivityType: item.activityId,
            };
            await customers.push(Obj);
          }
        }
      }
    }
    return res
      .status(200)
      .json({ Promotion: customers, messge: "success", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};
export const PromotionApply1 = async (req, res, next) => {
  try {
    const customers = [];
    const existPromotion = await Promotion.find({
      database: req.params.database,
      status: "Active",
    })
      .populate({ path: "activityId", model: "activity" })
      .populate({ path: "productWise.freeProduct", model: "product" });
    if (existPromotion.length === 0) {
      return res
        .status(404)
        .json({ message: "Promotion Not Found", status: false });
    }
    for (let item of existPromotion) {
      let startOfDay;
      let endOfDay;
      if (req.body.startDate && req.body.endDate) {
        startOfDay = new Date(req.body.startDate);
        endOfDay = new Date(req.body.endDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        endOfDay.setUTCHours(23, 59, 59, 999);
      } else {
        startOfDay = new Date(item.activityId.FromDate);
        endOfDay = new Date(item.activityId.ToDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        endOfDay.setUTCHours(23, 59, 59, 999);
      }
      // const startOfDay = new Date(item.activityId.FromDate);
      // const endOfDay = new Date(item.activityId.ToDate);
      // startOfDay.setUTCHours(0, 0, 0, 0);
      // endOfDay.setUTCHours(23, 59, 59, 999);
      const customer = await Customer.find({ status: "Active" }).populate({
        path: "created_by",
        model: "user",
      });
      if (customer.length === 0) {
        return res
          .status(404)
          .json({ message: "Party Not Found", status: false });
      }
      for (let id of customer) {
        let totalAmount = 0;
        let totalQty = 0;
        let party = {};
        const existOrder = await CreateOrder.find({
          partyId: id._id.toString(),
          date: { $gte: startOfDay, $lte: endOfDay },
        })
          .populate({ path: "partyId", model: "customer" })
          .populate({ path: "orderItems.productId", model: "product" });
        if (existOrder.length === 0) {
          continue;
        } else {
          for (let item of existOrder) {
            totalAmount += item.grandTotal;
            totalQty += item.qty;
            party = id;
          }
          if (item.productWise.length > 0) {
            let productItems = [];
            for (let item of existOrder) {
              productItems = productItems.concat(item.orderItems);
            }
            for (let items of item.productWise) {
              let totalProductQty = 0;
              let offerQty = 0;
              let status = "Pending";
              let AchieveQty = 0;
              let remainingQty = 0;
              let productName = "";
              let freeProductName = "";
              productItems.forEach((item) => {
                if (
                  item.productId._id.toString() === items.productId.toString()
                ) {
                  totalProductQty += item.qty;
                  productName += item.productId.Product_Title;
                }
              });
              if (items.targetQty < totalProductQty) {
                AchieveQty = totalProductQty;
                if (items.freeProductQty) {
                  offerQty = `${items.freeProductQty} qty`;
                  freeProductName = items.freeProduct.Product_Title;
                } else if (items.discountPercentage) {
                  offerQty = `${items.discountPercentage}%`;
                } else {
                  offerQty = `₹${items.discountAmount}`;
                }
                status = "Completed";
              } else {
                AchieveQty = totalProductQty;
                remainingQty = items.targetQty - totalProductQty;
              }
              let Obj = {
                partyId: party,
                productName: productName,
                Target: items.targetQty,
                Achieved: AchieveQty,
                Balance: remainingQty,
                Status: status,
                OfferAmount: offerQty,
                FreeProduct: freeProductName,
                type: "ProductWise",
              };
              if (productName) {
                await customers.push(Obj);
              }
            }
          } else if (item.amountWise.length > 0) {
            let remainingAmount = 0;
            let status = "Pending";
            let offerAmount = 0;
            if (item.amountWise[0].totalAmount <= totalAmount) {
              remainingAmount = 0;
              status = "Completed";
              offerAmount = `₹${item.amountWise[0].percentageAmount}`;
            } else {
              remainingAmount = item.amountWise[0].totalAmount - totalAmount;
            }
            let Obj = {
              partyId: party,
              Target: item.amountWise[0].totalAmount,
              Achieved: totalAmount,
              Balance: remainingAmount,
              Status: status,
              OfferAmount: offerAmount,
              type: "AmountWise",
            };
            await customers.push(Obj);
          } else if (item.percentageWise.length > 0) {
            let remainingAmount = 0;
            let status = "Pending";
            let offerPercentage = 0;
            if (item.percentageWise[0].totalAmount <= totalAmount) {
              remainingAmount = 0;
              status = "Completed";
              offerPercentage = `${item.percentageWise[0].percentageDiscount}%`;
            } else {
              remainingAmount =
                item.percentageWise[0].totalAmount - totalAmount;
            }
            let Obj = {
              partyId: party,
              Target: item.percentageWise[0].totalAmount,
              Achieved: totalAmount,
              Balance: remainingAmount,
              Status: status,
              OfferAmount: offerPercentage,
              type: "PercentageWise",
            };
            await customers.push(Obj);
          }
        }
      }
    }
    return res
      .status(200)
      .json({ Promotion: customers, messge: "success", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};
export const PromotionApplyForSalesPerson = async (req, res, next) => {
  try {
    const customers = [];
    const existPromotion = await Promotion.find({
      database: req.params.database,
      status: "Active",
    })
      .populate({ path: "activityId", model: "activity" })
      .populate({ path: "productWise.freeProduct", model: "product" });
    if (existPromotion.length === 0) {
      return res
        .status(404)
        .json({ message: "Promotion Not Found", status: false });
    }
    for (let item of existPromotion) {
      let startOfDay;
      let endOfDay;
      if (req.body.startDate && req.body.endDate) {
        startOfDay = new Date(req.body.startDate);
        endOfDay = new Date(req.body.endDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        endOfDay.setUTCHours(23, 59, 59, 999);
      } else {
        startOfDay = new Date(item.activityId.FromDate);
        endOfDay = new Date(item.activityId.ToDate);
        startOfDay.setUTCHours(0, 0, 0, 0);
        endOfDay.setUTCHours(23, 59, 59, 999);
      }
      const customer = await Customer.find({
        status: "Active",
        created_by: req.params.id,
      }).populate({ path: "created_by", model: "user" });
      if (customer.length === 0) {
        return res
          .status(404)
          .json({ message: "Party Not Found", status: false });
      }
      for (let id of customer) {
        let totalAmount = 0;
        let totalQty = 0;
        let party = {};
        const existOrder = await CreateOrder.find({
          partyId: id._id.toString(),
          date: { $gte: startOfDay, $lte: endOfDay },
        })
          .populate({ path: "partyId", model: "customer" })
          .populate({ path: "orderItems.productId", model: "product" });
        if (existOrder.length === 0) {
          continue;
        } else {
          for (let item of existOrder) {
            totalAmount += item.grandTotal;
            totalQty += item.qty;
            party = id;
          }
          if (item.productWise.length > 0) {
            let productItems = [];
            for (let item of existOrder) {
              productItems = productItems.concat(item.orderItems);
            }
            for (let items of item.productWise) {
              let totalProductQty = 0;
              let offerQty = 0;
              let status = "Pending";
              let AchieveQty = 0;
              let remainingQty = 0;
              let productName = "";
              let freeProductName = "";
              productItems.forEach((item) => {
                if (
                  item.productId._id.toString() === items.productId.toString()
                ) {
                  totalProductQty += item.qty;
                  productName += item.productId.Product_Title;
                }
              });
              if (items.targetQty < totalProductQty) {
                AchieveQty = totalProductQty;
                if (items.freeProductQty) {
                  offerQty = `${items.freeProductQty} qty`;
                  freeProductName = items.freeProduct.Product_Title;
                } else if (items.discountPercentage) {
                  offerQty = `${items.discountPercentage}%`;
                } else {
                  offerQty = `₹${items.discountAmount}`;
                }
                status = "Completed";
              } else {
                AchieveQty = totalProductQty;
                remainingQty = items.targetQty - totalProductQty;
              }
              let Obj = {
                partyId: party,
                productName: productName,
                Target: items.targetQty,
                Achieved: AchieveQty,
                Balance: remainingQty,
                Status: status,
                OfferAmount: offerQty,
                FreeProduct: freeProductName,
                type: "ProductWise",
                ActivityId: item.activityId,
              };
              if (productName) {
                await customers.push(Obj);
              }
            }
          } else if (item.amountWise.length > 0) {
            let remainingAmount = 0;
            let status = "Pending";
            let offerAmount = 0;
            if (item.amountWise[0].totalAmount <= totalAmount) {
              remainingAmount = 0;
              status = "Completed";
              offerAmount = `₹${item.amountWise[0].percentageAmount}`;
            } else {
              remainingAmount = item.amountWise[0].totalAmount - totalAmount;
            }
            let Obj = {
              partyId: party,
              Target: item.amountWise[0].totalAmount,
              Achieved: totalAmount,
              Balance: remainingAmount,
              Status: status,
              OfferAmount: offerAmount,
              type: "AmountWise",
              ActivityId: item.activityId,
            };
            await customers.push(Obj);
          } else if (item.percentageWise.length > 0) {
            let remainingAmount = 0;
            let status = "Pending";
            let offerPercentage = 0;
            if (item.percentageWise[0].totalAmount <= totalAmount) {
              remainingAmount = 0;
              status = "Completed";
              offerPercentage = `${item.percentageWise[0].percentageDiscount}%`;
            } else {
              remainingAmount =
                item.percentageWise[0].totalAmount - totalAmount;
            }
            let Obj = {
              partyId: party,
              Target: item.percentageWise[0].totalAmount,
              Achieved: totalAmount,
              Balance: remainingAmount,
              Status: status,
              OfferAmount: offerPercentage,
              type: "PercentageWise",
              ActivityId: item.activityId,
            };
            await customers.push(Obj);
          }
        }
      }
    }
    return res
      .status(200)
      .json({ Promotion: customers, messge: "success", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Internal Server Error", status: false });
  }
};
