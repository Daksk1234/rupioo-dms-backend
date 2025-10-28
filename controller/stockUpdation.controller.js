import moment from "moment";
import { StockUpdation } from "../model/stockUpdation.model.js";
import { User } from "../model/user.model.js";
import { Stock } from "../model/stock.js";
import { CreateOrder } from "../model/createOrder.model.js";
import { Warehouse } from "../model/warehouse.model.js";
import { Product } from "../model/product.model.js";
import { Customer } from "../model/customer.model.js";
import { ClosingStock } from "../model/closingStock.model.js";
import { warehouseNo } from "../service/invoice.js";
import { PurchaseOrder } from "../model/purchaseOrder.model.js";
import { RawProduct } from "../model/rawProduct.model.js";
import { otpVerify } from "./warehouse.controller.js";

const idEq = (a, b) => String(a || "") === String(b || "");

/** quick helper: see if an id belongs to Product or RawProduct */
async function detectCatalogModel(id) {
  if (!id) return { model: null };
  const p = await Product.findById(id).select("_id").lean();
  if (p) return { model: "product" };
  const r = await RawProduct.findById(id).select("_id").lean();
  if (r) return { model: "raw" };
  return { model: null };
}

/** INWARD / OUTWARD (unchanged) */
export const viewInWardStockToWarehouse = async (req, res) => {
  try {
    const stock = await StockUpdation.find({
      warehouseToId: req.params.id,
      transferStatus: "InProcess",
    })
      .populate({ path: "productItems.productId", model: "product" })
      .populate({ path: "warehouseFromId", model: "warehouse" })
      .populate({ path: "warehouseToId", model: "warehouse" })
      .exec();

    if (!stock?.length) {
      return res
        .status(404)
        .json({ message: "No warehouse found", status: false });
    }
    return res.status(200).json({ Warehouse: stock, status: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err, status: false });
  }
};

export const viewOutWardStockToWarehouse = async (req, res) => {
  try {
    const stock = await StockUpdation.find({
      warehouseFromId: req.params.id,
      transferStatus: "InProcess",
    })
      .populate({ path: "productItems.productId", model: "product" })
      .populate({ path: "warehouseToId", model: "warehouse" })
      .populate({ path: "warehouseFromId", model: "warehouse" })
      .exec();

    if (!stock?.length) {
      return res
        .status(404)
        .json({ message: "No warehouse found", status: false });
    }
    return res.status(200).json({ Warehouse: stock, status: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err, status: false });
  }
};

/**
 * POST /stock-transfer-warehouse
 * - expects productItems[].destinationProductId
 * - decrements currentStock & increments pendingStock in source
 */
export const stockTransferToWarehouse = async (req, res) => {
  try {
    const {
      warehouseToId,
      warehouseFromId,
      stockTransferDate,
      productItems = [],
      grandTotal,
      transferStatus,
      created_by,
      InwardStatus,
      OutwardStatus,
      fromSectionId = "",
      toSectionId = "",
    } = req.body;

    const sourceWh = await Warehouse.findById(warehouseFromId);
    if (!sourceWh) {
      return res
        .status(400)
        .json({ message: "Warehouse From Not Found", status: false });
    }

    const whNo = await warehouseNo(sourceWh.database);
    sourceWh.warehouseNo = sourceWh.id + whNo;

    // Validate & mark pending in source
    for (const raw of productItems) {
      const item = {
        ...raw,
        destinationProductId: raw.destinationProductId || raw.productId,
      };
      // Try product line
      let src = await Warehouse.findOne({
        _id: warehouseFromId,
        "productItems.productId": item.productId,
      });
      let line, path;

      if (src) {
        path = "productId";
        line = src.productItems.find((x) => idEq(x.productId, item.productId));
      } else {
        // Try raw product line
        src = await Warehouse.findOne({
          _id: warehouseFromId,
          "productItems.rawProductId": item.productId,
        });
        path = "rawProductId";
        line = src?.productItems?.find((x) =>
          idEq(x.rawProductId, item.productId)
        );
      }

      if (!src || !line) {
        return res
          .status(400)
          .json({ error: "Product not found in the source warehouse" });
      }

      const ask = Number(item.transferQty || 0);
      const avail = Number(line.currentStock || 0);
      if (ask <= 0 || ask > avail) {
        return res
          .status(400)
          .json({
            error: `Insufficient stock for product ${item.productId}`,
            status: false,
          });
      }

      // move from current -> pending
      line.currentStock = avail - ask;
      line.pendingStock = Number(line.pendingStock || 0) + ask;
      line.totalPrice =
        Number(line.totalPrice || 0) - Number(item.totalPrice || 0);
      line.price = Number(item.price || line.price || 0);

      src.markModified("productItems");
      await src.save();
    }

    const doc = new StockUpdation({
      created_by,
      warehouseToId,
      warehouseFromId,
      stockTransferDate,
      productItems: productItems.map((p) => ({
        ...p,
        destinationProductId: p.destinationProductId || p.productId,
      })),
      grandTotal,
      transferStatus,
      InwardStatus,
      OutwardStatus,
      database: sourceWh.database,
      warehouseNo: sourceWh.warehouseNo,
      fromSectionId,
      toSectionId,
    });

    await doc.save();
    await sourceWh.save();

    return res
      .status(201)
      .json({ message: "Stock transfer successful", status: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

/**
 * PUT /update-warehoue-to-warehouse/:id
 * Confirm transfer:
 * - remove pending from source
 * - add/increment on destination (handles Product or RawProduct)
 */
export const updateWarehousetoWarehouse = async (req, res) => {
  try {
    const transfer = await StockUpdation.findById(req.params.id);
    if (!transfer) {
      return res
        .status(404)
        .json({ message: "Warehouse not found", status: false });
    }

    // persist status/body first
    await StockUpdation.findByIdAndUpdate(transfer._id, req.body, {
      new: true,
    });

    for (const item of transfer.productItems) {
      // 1) clear pending in SOURCE
      const src =
        (await Warehouse.findOne({
          _id: transfer.warehouseFromId,
          "productItems.productId": item.productId,
        })) ||
        (await Warehouse.findOne({
          _id: transfer.warehouseFromId,
          "productItems.rawProductId": item.productId,
        }));

      if (src) {
        const sline =
          src.productItems.find((p) => idEq(p.productId, item.productId)) ||
          src.productItems.find((p) => idEq(p.rawProductId, item.productId));
        if (sline) {
          sline.pendingStock = Math.max(
            0,
            Number(sline.pendingStock || 0) - Number(item.transferQty || 0)
          );
          src.markModified("productItems");
          await src.save();
        }
      }

      // 2) apply to DEST
      const destId = item.destinationProductId || item.productId;
      let dest =
        (await Warehouse.findOne({
          _id: transfer.warehouseToId,
          "productItems.productId": destId,
        })) ||
        (await Warehouse.findOne({
          _id: transfer.warehouseToId,
          "productItems.rawProductId": destId,
        }));

      if (dest) {
        const dline =
          dest.productItems.find((p) => idEq(p.productId, destId)) ||
          dest.productItems.find((p) => idEq(p.rawProductId, destId));

        if (dline) {
          // update linked catalog (“best effort”)
          const { model } = await detectCatalogModel(destId);
          try {
            if (model === "raw") {
              const rp = await RawProduct.findById(destId);
              if (rp) {
                if (typeof rp.qty === "number")
                  rp.qty += Number(item.transferQty || 0);
                if (typeof rp.Opening_Stock === "number")
                  rp.Opening_Stock += Number(item.transferQty || 0);
                await rp.save();
              }
            } else if (model === "product") {
              const pr = await Product.findById(destId);
              if (pr) {
                if (typeof pr.qty === "number")
                  pr.qty += Number(item.transferQty || 0);
                if (typeof pr.Opening_Stock === "number")
                  pr.Opening_Stock += Number(item.transferQty || 0);
                await pr.save();
              }
            }
          } catch (_) {}

          dline.price = Number(item.price || dline.price || 0);
          dline.currentStock =
            Number(dline.currentStock || 0) + Number(item.transferQty || 0);
          dline.totalPrice =
            Number(dline.totalPrice || 0) + Number(item.totalPrice || 0);

          dest.markModified("productItems");
          await dest.save();
        }
      } else {
        // dest doesn't have this line; create one as product or raw
        const { model } = await detectCatalogModel(destId);
        const newLine = {
          unitType: item.unitType,
          primaryUnit: item.primaryUnit,
          secondaryUnit: item.secondaryUnit,
          secondarySize: item.secondarySize,
          Size: item.Size,
          price: Number(item.price || 0),
          gstPercentage: item.gstPercentage,
          igstTaxType: !!item.igstTaxType,
          transferQty: Number(item.transferQty || 0),
          currentStock: Number(item.transferQty || 0),
          totalPrice: Number(item.totalPrice || 0),
          pendingStock: 0,
        };
        if (model === "raw") newLine.rawProductId = destId;
        else newLine.productId = destId;

        await Warehouse.updateOne(
          { _id: transfer.warehouseToId },
          {
            $push: { productItems: newLine },
            $set: {
              stockTransferDate: transfer.stockTransferDate,
              transferStatus: transfer.transferStatus,
              grandTotal: transfer.grandTotal,
              warehouseFromId: transfer.warehouseFromId,
            },
          },
          { upsert: true }
        );
      }
    }

    return res
      .status(200)
      .json({ message: "status updated successfull!", status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const viewWarehouseStock = async (req, res) => {
  try {
    const database = req.params.database;
    const warehouse = await StockUpdation.find({ database: database })
      .sort({ sortorder: -1 })
      .populate({ path: "productItems.productId", model: "product" })
      .populate({ path: "warehouseToId", model: "warehouse" })
      .populate({ path: "warehouseFromId", model: "warehouse" });
    if (warehouse.length > 0) {
      return res.status(200).json({ Warehouse: warehouse, status: true });
    } else {
      return res
        .status(404)
        .json({ message: "Warehouse not found", status: false });
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};
// doubt
export const viewProductInWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findById(req.params.id).populate({
      path: "productItems.productId",
      model: "product",
    });
    if (!warehouse) {
      return res.status(400).json({ message: "Not Found", status: true });
    }
    const productDetails = warehouse.productItems.map((item) => {
      return {
        productId: item.productId._id,
        created_by: item.productId.created_by,
        Product_Title: item.productId.Product_Title,
        Size: item.productId.Size,
        discount: item.productId.discount,
        HSN_Code: item.productId.HSN_Code,
        "GST Rate": item.productId["GST Rate"],
        Product_Desc: item.productId.Product_Desc,
        Product_MRP: item.productId.Product_MRP,
        MIN_stockalert: item.productId.MIN_stockalert,
        warehouse: item.productId.warehouse,
        SubCategory: item.productId.SubCategory,
        Unit: item.productId.Unit,
        Warehouse_name: item.productId.Warehouse_name,
        createdAt: item.productId.createdAt,
        updatedAt: item.productId.updatedAt,
        unitType: item.unitType,
        transferQty: item.transferQty,
        price: item.price,
        totalPrice: item.totalPrice,
        _id: item._id,
      };
    });
    return res.status(200).json(productDetails);
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
//-------------------------------------------------------------
export const saveDamageItem1 = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findOne({ _id: req.body.warehouse });
    if (warehouse) {
      const newSubCategory = {
        productId: req.body.productId,
        unitType: req.body.unitType,
        transferQty: req.body.transferQty,
        Size: req.body.Size,
        currentStock: req.body.currentStock,
        price: req.body.price,
        totalPrice: req.body.totalPrice,
        demagePercentage: req.body.demagePercentage,
        reason: req.body.reason,
        typeStatus: req.body.typeStatus,
      };

      warehouse.typeStatus = req.body.typeStatus;
      warehouse.damageItem.push(newSubCategory);
      const savedDamageItem = await warehouse.save();
      return res
        .status(200)
        .json({
          message: "damageItem saved successfully",
          status: true,
          warehouse: savedDamageItem,
        });
    } else {
      return res
        .status(404)
        .json({ message: "damageItem not found", status: false });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error, status: false });
  }
};
export const saveDamageItem = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findOne({ _id: req.body.warehouse });
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "Warehouse not found", status: false });
    }
    const existingProduct = warehouse.productItems.find(
      (item) => item.productId.toString() === req.body.productId.toString()
    );

    if (existingProduct) {
      existingProduct.damageItem = {
        productId: req.body.productId,
        unitType: req.body.unitType,
        transferQty: req.body.transferQty,
        size: req.body.size,
        currentStock: req.body.currentStock,
        price: req.body.price,
        totalPrice: req.body.totalPrice,
        damagePercentage: req.body.damagePercentage,
        reason: req.body.reason,
        typeStatus: req.body.typeStatus,
      };
      existingProduct.currentStock = req.body.currentStock;
      warehouse.typeStatus = req.body.typeStatus;
      const savedWarehouse = await warehouse.save();
      return res
        .status(200)
        .json({
          message: "Damage item saved successfully",
          status: true,
          warehouse: savedWarehouse,
        });
    } else {
      return res
        .status(404)
        .json({ message: "product not found in warehouse", status: false });
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal server error", status: false });
  }
};
export const updateDamageItem = async (req, res, next) => {
  try {
    const warehouse = await Warehouse.findOne({ _id: req.body.warehouse });
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "Warehouse not found", status: false });
    }
    const existingProduct = warehouse.productItems.find(
      (item) => item.productId === req.body.productId
    );
    if (!existingProduct) {
      return res
        .status(404)
        .json({ message: "Product not found", status: false });
    }
    existingProduct.damageItem = {
      productId: req.body.productId || existingProduct.damageItem.productId,
      transferQty:
        req.body.transferQty || existingProduct.damageItem.transferQty,
      currentStock:
        req.body.currentStock || existingProduct.damageItem.currentStock,
      price: req.body.price || existingProduct.damageItem.price,
      totalPrice: req.body.totalPrice || existingProduct.damageItem.totalPrice,
      damagePercentage:
        req.body.damagePercentage ||
        existingProduct.damageItem.damagePercentage,
      reason: req.body.reason || existingProduct.damageItem.reason,
      typeStatus: req.body.typeStatus || existingProduct.damageItem.typeStatus,
    };
    existingProduct.currentStock =
      req.body.currentStock || existingProduct.currentStock;
    warehouse.typeStatus = req.body.typeStatus;
    const savedWarehouse = await warehouse.save();
    return res
      .status(200)
      .json({
        message: "Damage item updated successfully",
        status: true,
        warehouse: savedWarehouse,
      });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal server error", status: false });
  }
};
export const deletedamageItem = async (req, res) => {
  try {
    const { warehouseId, damageItemId } = req.params;
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "warehouse not found", status: false });
    }
    warehouse.damageItem = warehouse.damageItem.filter(
      (sub) => sub._id.toString() !== damageItemId
    );
    const updatedDamageItem = await warehouse.save();
    return res
      .status(200)
      .json({
        message: "damageItem deleted successfully",
        status: true,
        warehouse: updatedDamageItem,
      });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const getDamageItems = async (req, res, next) => {
  try {
    const warehouseId = req.params.id;
    const warehouse = await Warehouse.findOne({ _id: warehouseId }).populate({
      path: "damageItem.productId",
      model: "product",
    });
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "Warehouse not found", status: false });
    }
    const damageItems = warehouse.damageItem;
    if (!damageItems || damageItems.length === 0) {
      return res
        .status(404)
        .json({ message: "No damage items found", status: false });
    }
    const resultArray = damageItems.map((item) => ({
      warehouse: {
        _id: warehouse._id,
        warehouseName: warehouse.warehouseName,
        // lastName: warehouse.lastName,
        typeStatus: warehouse.typeStatus,
      },
      damageItem: {
        productId: {
          _id: item.productId._id,
          Product_Title: item.productId.Product_Title,
        },
        _id: item._id,
        unitType: item.unitType,
        transferQty: item.transferQty,
        Size: item.Size,
        currentStock: item.currentStock,
        price: item.price,
        totalPrice: item.totalPrice,
        demagePercentage: item.demagePercentage,
        reason: item.reason,
        typeStatus: item.typeStatus,
      },
    }));

    return res.status(200).json({ damageItems: resultArray, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message, status: false });
  }
};
export const updateTypeStatus = async (req, res, next) => {
  try {
    const warehouseId = req.params.id;
    const newTypeStatus = req.body.typeStatus;
    const updatedWarehouse = await Warehouse.findOneAndUpdate({
      _id: warehouseId,
    });
    if (!updatedWarehouse) {
      return res
        .status(404)
        .json({ message: "Warehouse not found", status: false });
    }
    const damageItem = updatedWarehouse.damageItem.find(
      (item) => item.productId.toString() === req.params.productId
    );
    if (damageItem) {
      (damageItem.typeStatus = newTypeStatus || damageItem.typeStatus),
        (damageItem.damagePercentage =
          req.body.damagePercentage || damageItem.damagePercentage),
        (damageItem.reason = req.body.reason || damageItem.reason);
      await updatedWarehouse.save();
    }
    return res.status(200).json({ warehouse: updatedWarehouse, status: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message, status: false });
  }
};
//--------------------------------------------------------------------------
export const ViewAllWarehouse1 = async () => {
  try {
    let array = [];
    const ware = await Warehouse.find({}).sort({ sortorder: -1 }).select("_id");
    if (!ware) {
    }
    for (let id of ware) {
      let userData = await Warehouse.findById({ _id: id._id }).sort({
        sortorder: -1,
      });
      const {
        _id,
        warehouseName,
        address,
        mobileNo,
        landlineNumber,
        productItems,
        damageItem,
        database,
      } = userData;
      const warehouse = {
        warehouseId: _id,
        warehouseName: warehouseName,
        mobileNumber: mobileNo,
        landlineNumber: landlineNumber,
        address: address,
        productItems: productItems,
        damageItem: damageItem,
        database: database,
        closingStatus: "closing",
      };
      if (warehouse) {
        const stock = await Stock.create(warehouse);
      }
    }
    await deleteModel();
  } catch (err) {
    console.error(err);
  }
};
export const viewStockClosingWarehouse = async (req, res, next) => {
  try {
    const warehouse = await Stock.find({ database: req.params.database })
      .sort({ date: 1, sortorder: -1 })
      .populate({ path: "productItems.productId", model: "product" });
    //.populate({ path: "warehouseId", model: "warehouse" })
    return warehouse.length > 0
      ? res.status(200).json({ Warehouse: warehouse, status: true })
      : res.json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const viewOpeningStockWarehouse = async (req, res, next) => {
  try {
    let opening = [];
    const currentDate = new Date();
    const warehouse = await Stock.find({})
      .sort({ sortorder: -1 })
      .populate({ path: "productItems.productId", model: "product" });
    for (let ware of warehouse) {
      ware.openingStatus = "opening";
      ware.Openingdate = currentDate;
      const openingWarehouse = await ware.save();
      opening.push(openingWarehouse);
    }
    return opening.length > 0
      ? res.status(200).json({ Warehouse: opening, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
// my code
export const ViewOverDueStock1 = async (req, res, next) => {
  try {
    const currentDate = moment();
    const startOfLastMonth = currentDate.clone().subtract(30, "days");
    const productsNotOrderedLastMonth = await Product.find({
      status: "Active",
      createdAt: { $lt: startOfLastMonth.toDate() },
    });
    if (
      !productsNotOrderedLastMonth ||
      productsNotOrderedLastMonth.length === 0
    ) {
      return res
        .status(404)
        .json({ message: "No products found", status: false });
    }
    const allOrderedProducts = await CreateOrder.find({
      createdAt: { $gte: startOfLastMonth.toDate() },
    }).distinct("orderItems");
    let allProduct = [];
    for (let item of productsNotOrderedLastMonth) {
      const wasOrderedLastMonth = await allOrderedProducts.find(
        (orderedItem) =>
          orderedItem.productId.toString() === item._id.toString()
      );
      if (!wasOrderedLastMonth) {
        const warehouse = await Warehouse.findById(item.warehouse);
        if (warehouse) {
          const qty = warehouse.productItems.find(
            (item) => item.productId.toString() === item._id.toString()
          );
          if (qty) {
            let pro = {
              item: item,
              Qty: qty.currentStock,
            };
            allProduct.push(pro);
          } else {
            allProduct.push(item);
            console.error(`Product with ID ${item._id} not found in warehouse`);
          }
        } else {
          console.error(`Warehouse with ID ${item.warehouse} not found`);
        }
      }
    }
    return res.status(200).json({ allProduct, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewOverDueStock = async (req, res, next) => {
  try {
    const allProduct = [];
    const currentDate = moment();
    const startOfLastMonth = currentDate.clone().subtract(30, "days");
    const productsNotOrderedLastMonth = await Product.find({
      database: req.params.database,
      status: "Active",
      createdAt: { $lt: startOfLastMonth.toDate() },
    })
      .populate({ path: "partyId", model: "customer" })
      .populate({ path: "warehouse", model: "warehouse" });
    if (
      !productsNotOrderedLastMonth ||
      productsNotOrderedLastMonth.length === 0
    ) {
      return res
        .status(404)
        .json({ message: "No products found", status: false });
    }
    const orderedProductsLastMonth = await CreateOrder.find({
      database: req.params.database,
      createdAt: { $gte: startOfLastMonth.toDate() },
    }).distinct("orderItems");
    const orderedProductIdsLastMonth = orderedProductsLastMonth.map(
      (orderItem) => orderItem.productId.toString()
    );
    const productsToProcess = productsNotOrderedLastMonth.filter(
      (product) => !orderedProductIdsLastMonth.includes(product._id.toString())
    );
    for (let item of productsToProcess) {
      let partyId = "";
      let days = 0;
      const purchase = await PurchaseOrder.find({
        "orderItems.productId": item._id.toString(),
      })
        .sort({ sortorder: -1 })
        .populate({ path: "partyId", model: "customer" });

      if (purchase.length > 0) {
        partyId = purchase[purchase.length - 1].partyId.CompanyName;
      }
      const lastDate = item.salesDate || item.createdAt;
      const lastOrderDate = new Date(lastDate);
      const currentDates = new Date();
      const timeDifference = currentDates - lastOrderDate;
      days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
      const products = {
        product: item,
        overDue: days,
      };
      allProduct.push(products);
    }
    return res.status(200).json({ allProduct, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewDeadParty = async (req, res, next) => {
  try {
    let days = 0;
    const Parties = [];
    const userId = req.params.id;
    const database = req.params.database;
    const currentDate = moment();
    const startOfLastMonth = currentDate.clone().subtract(30, "days");

    const hierarchy = await Customer.find({
      database: database,
      status: "Active",
      leadStatusCheck: "false",
      createdAt: { $lt: startOfLastMonth },
    })
      .populate({ path: "created_by", model: "user" })
      .populate({ path: "category", model: "customerGroup" });

    const allOrderedParties = await CreateOrder.find({
      database: database,
      createdAt: { $gte: startOfLastMonth.toDate() },
    });
    let allParty = [];
    let result = [];
    for (let item of hierarchy) {
      const party = allOrderedParties.find(
        (items) => items.partyId.toString() === item._id.toString()
      );
      if (!party) {
        allParty.push(item);
      }
    }
    let lastDays = "";
    for (let id of allParty) {
      let purchaseDate = "";
      const purchase = await PurchaseOrder.find({ partyId: id._id.toString() })
        .sort({ sortorder: -1 })
        .populate({ path: "partyId", model: "customer" });
      if (purchase.length > 0) {
        purchaseDate = purchase[purchase.length - 1].createdAt;
        const lastDate = purchaseDate;
        const lastOrderDate = new Date(lastDate);
        const currentDates = new Date();
        const timeDifference = currentDates - lastOrderDate;
        days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
      }
      const products = {
        Party: id,
        purchaseDate: purchaseDate,
        days: days,
      };
      Parties.push(products);
      days = 0;
    }
    return res.status(200).json({ Parties: Parties, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
export const ViewDeadParty1 = async (req, res, next) => {
  try {
    const Parties = [];
    const userId = req.params.id;
    const database = req.params.database;
    const currentDate = moment();
    const startOfLastMonth = currentDate.clone().subtract(30, "days");
    const hierarchy = await Customer.find({
      database: database,
      status: "Active",
      leadStatusCheck: "false",
      createdAt: { $lt: startOfLastMonth },
    })
      .populate({ path: "created_by", model: "user" })
      .populate({ path: "category", model: "customerGroup" })
      .lean();
    const allOrderedParties = await CreateOrder.find({
      database: database,
      createdAt: { $gte: startOfLastMonth.toDate() },
    }).lean();
    const receiptMap = {};
    for (let item of hierarchy) {
      let purchaseDate = "";
      const purchase = await PurchaseOrder.find({
        partyId: item._id.toString(),
      })
        .sort({ sortorder: -1 })
        .populate({ path: "partyId", model: "customer" });
      if (purchase.length > 0) {
        purchaseDate = purchase[purchase.length - 1].createdAt;
      }
      const products = {
        Party: item,
        purchaseDate: purchaseDate,
      };

      Parties.push(products);
    }
    return res.status(200).json({ Parties: Parties, status: true });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const partyHierarchy = async function partyHierarchy(
  userId,
  database,
  processedIds = new Set()
) {
  try {
    if (processedIds.has(userId)) {
      return [];
    }
    processedIds.add(userId);
    const user = await User.findOne({
      _id: userId,
      database: `${database}`,
    }).lean();
    if (!user) {
      return [];
    }
    const createdByUserId = user.created_by;
    if (!createdByUserId) {
      return [user];
    }
    const parentResults = await partyHierarchy(
      createdByUserId,
      database,
      processedIds
    );
    return [user, ...parentResults];
  } catch (error) {
    console.error("Error in getCustomerHierarchy:", error);
    throw error;
  }
};
export const ViewAllWarehouse = async () => {
  try {
    let array = [];
    const ware = await Warehouse.find({}).sort({ sortorder: -1 }).select("_id");
    if (!ware) {
    }
    for (let id of ware) {
      let userData = await Warehouse.findById({ _id: id._id })
        .sort({ sortorder: -1 })
        .populate({ path: "productItems.productId", model: "product" });
      const {
        _id,
        warehouseName,
        address,
        mobileNo,
        landlineNumber,
        productItems,
        damageItem,
        database,
      } = userData;
      const stocks = await ClosingStocks(id._id, productItems);
      const warehouse = {
        warehouseId: _id,
        warehouseName: warehouseName,
        mobileNumber: mobileNo,
        landlineNumber: landlineNumber,
        address: address,
        productItems: stocks,
        damageItem: damageItem,
        database: database,
        closingStatus: "closing",
      };
      if (warehouse) {
        const stock = await Stock.create(warehouse);
      }
    }
    await deleteModel();
  } catch (err) {
    console.error(err);
  }
};
export const ClosingStocks = async (warehouse, productItem) => {
  try {
    const gstDetails = [];
    let cgstRate = 0;
    let igstRate = 0;
    let tax = 0;
    let pQty = 0;
    let pRate = 0;
    let pBAmount = 0;
    let pTaxRate = 0;
    let pTotal = 0;
    let sQty = 0;
    let sRate = 0;
    let sBAmount = 0;
    let sTaxRate = 0;
    let sTotal = 0;
    for (let item of productItem) {
      const stock = await ClosingStock.findOne({
        warehouseId1: warehouse,
        productId: item.productId._id.toString(),
      });
      if (stock) {
        pQty = stock.pQty || 0;
        pRate = stock.pRate || 0;
        pBAmount = stock.pBAmount || 0;
        pTaxRate = stock.pTaxRate || 0;
        pTotal = stock.pTotal || 0;
        sQty = stock.sQty || 0;
        sRate = stock.sRate || 0;
        sBAmount = stock.sBAmount || 0;
        sTaxRate = stock.sTaxRate || 0;
        sTotal = stock.sTotal || 0;
      }
      const rate = item.gstPercentage / 2;
      if (item.igstTaxType === false) {
        cgstRate = (item.currentStock * item.price * rate) / 100;
        tax = cgstRate * 2;
      } else {
        igstRate = (item.currentStock * item.price * item.gstPercentage) / 100;
        tax = igstRate;
      }
      const gst = {
        productId: item.productId._id.toString(),
        unitType: item.unitType,
        Size: item.Size,
        currentStock: item.currentStock,
        transferQty: item.transferQty,
        price: item.price,
        totalPrice: item.totalPrice,
        pendingStock: item.pendingStock,
        igstTaxType: item.igstTaxType,
        gstPercentage: item.gstPercentage,
        damageItem: item.damageItem,
        cQty: item.currentStock || 0,
        cRate: item.price || 0,
        cBAmount: item.totalPrice || 0,
        cTaxRate: tax || 0,
        cTotal: item.totalPrice + tax || 0,
        pQty: pQty || 0,
        pRate: pRate || 0,
        pBAmount: pBAmount || 0,
        pTaxRate: pTaxRate || 0,
        pTotal: pTotal || 0,
        sQty: sQty || 0,
        sRate: sRate || 0,
        sBAmount: sBAmount || 0,
        sTaxRate: sTaxRate || 0,
        sTotal: sTotal || 0,
      };
      gstDetails.push(gst);
      pQty = 0;
      pRate = 0;
      pBAmount = 0;
      pTaxRate = 0;
      pTotal = 0;
      sQty = 0;
      sRate = 0;
      sBAmount = 0;
      sTaxRate = 0;
      sTotal = 0;
    }
    return gstDetails;
  } catch (err) {
    console.log(err);
  }
};
export const deleteModel = async () => {
  try {
    await ClosingStock.deleteMany({});
    return true;
  } catch (error) {
    console.error("Error deleting data:", error);
  }
};
// InWard And OutWard
export const ClosingPurchase = async (orderItem, warehouse) => {
  try {
    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;
    let tax = 0;
    const rate = parseInt(orderItem.gstPercentage) / 2;
    if (orderItem.igstTaxType === false) {
      cgstRate = (orderItem.transferQty * orderItem.price * rate) / 100;
      sgstRate = (orderItem.transferQty * orderItem.price * rate) / 100;
      tax = cgstRate + sgstRate;
    } else {
      igstRate =
        (orderItem.transferQty *
          orderItem.price *
          parseInt(orderItem.gstPercentage)) /
        100;
      tax = igstRate;
    }
    const stock = await ClosingStock.findOne({
      warehouseId1: warehouse,
      productId: orderItem.productId,
    });
    if (stock) {
      stock.pQty += orderItem.transferQty;
      stock.pRate += orderItem.price;
      stock.pBAmount += orderItem.totalPrice;
      stock.pTaxRate += tax;
      stock.pTotal += orderItem.totalPrice + tax;
      await stock.save();
    } else {
      const closing = ClosingStock({
        warehouseId1: warehouse,
        productId: orderItem.productId,
        pQty: orderItem.transferQty,
        pRate: orderItem.price,
        pBAmount: orderItem.totalPrice,
        pTaxRate: tax,
        pTotal: orderItem.totalPrice + tax,
      });
      await closing.save();
    }
    return true;
  } catch (err) {
    console.log(err);
  }
};
export const ClosingSales = async (orderItem, warehouse) => {
  try {
    let cgstRate = 0;
    let sgstRate = 0;
    let igstRate = 0;
    let tax = 0;
    const rate = parseInt(orderItem.gstPercentage) / 2;
    if (orderItem.igstTaxType === false) {
      cgstRate = (orderItem.transferQty * orderItem.price * rate) / 100;
      sgstRate = (orderItem.transferQty * orderItem.price * rate) / 100;
      tax = cgstRate + sgstRate.sgstRate;
    } else {
      igstRate =
        (orderItem.transferQty *
          orderItem.price *
          parseInt(orderItem.gstPercentage)) /
        100;
      tax = igstRate;
    }
    const stock = await ClosingStock.findOne({
      warehouseId1: warehouse,
      productId: orderItem.productId,
    });
    if (stock) {
      stock.sQty += orderItem.transferQty;
      stock.sRate += orderItem.price;
      stock.sBAmount += orderItem.totalPrice;
      stock.sTaxRate += tax;
      stock.sTotal += orderItem.totalPrice + tax;
      await stock.save();
    } else {
      const closing = ClosingStock({
        warehouseId1: warehouse,
        productId: orderItem.productId,
        sQty: orderItem.transferQty,
        sRate: orderItem.price,
        sBAmount: orderItem.totalPrice,
        sTaxRate: tax,
        sTotal: orderItem.totalPrice + tax,
      });
      await closing.save();
    }
    return true;
  } catch (err) {
    console.log(err);
  }
};

// export const stockReport = async (req, res, next) => {
//     try {
//         const { database } = req.params;
//         const purchaseOrders = await PurchaseOrder.find({ database, status: { $ne: "Deactive" } });
//         const salesOrders = await CreateOrder.find({ database, status: { $ne: "Deactive" } });
//        const productMap = {};
//         const allProductIds = new Set();
//         for (const po of purchaseOrders) {
//             const status = po.status || 'pending';
//             const totalTax = (status === 'completed')
//                 ? (po.coolieAndCartage || 0) +
//                   (po.labourCost || 0) +
//                   (po.localFreight || 0) +
//                   (po.miscellaneousCost || 0) +
//                   (po.transportationCost || 0)+
//                   (po.tax||0)
//                 : 0;
//             for (const item of po.orderItems) {
//                 const productId = item.productId?.toString();
//                 if (!productId) continue;

//                 allProductIds.add(productId);
//                 const qty = item.qty || 0;
//                 const totalPrice = item.totalPrice || 0;

//                 if (!productMap[productId]) {
//                     productMap[productId] = {
//                         productId,
//                         pQty: 0,
//                         purchasePendingQty: 0,
//                         sQty: 0,
//                         openingRate: 0,
//                         oQty: 0,
//                         Product_Title: "",
//                         HSN_Code: "",
//                         openingCombineTotal: 0,
//                         pTotalPrice: 0,
//                         avgPurchaseRate: 0,
//                         totalPurchaseData: 0,
//                         pendingStock: 0,
//                         pendingRate: 0,
//                         pendingStockTotal: 0,
//                         sRate: 0,
//                         sTotal: 0,
//                         closingQty: 0,
//                         closingAveRate: 0,
//                         closingTotal: 0,
//                         totalTax: 0
//                     };
//                 }

//                 const entry = productMap[productId];
//                 if (status === 'completed') {
//                     entry.pQty += qty;
//                     entry.pTotalPrice += totalPrice;
//                     entry.totalTax += totalTax;
//                     entry.totalPurchaseData += totalPrice + totalTax;
//                     // console.log("totalPurchaseData",entry,entry.totalTax,totalTax)
//                 } else {
//                     entry.purchasePendingQty += qty;
//                 }
//             }
//         }

//         for (const so of salesOrders) {
//             const status = so.status || 'pending';

//             for (const item of so.orderItems) {
//                 const productId = item.productId?.toString();
//                 if (!productId) continue;

//                 allProductIds.add(productId);
//                 const qty = item.qty || 0;
//                 const sTotal = item.totalPrice || 0;

//                 if (!productMap[productId]) {
//                     productMap[productId] = {
//                         productId,
//                         pQty: 0,
//                         purchasePendingQty: 0,
//                         sQty: 0,
//                         openingRate: 0,
//                         oQty: 0,
//                         Product_Title: "",
//                         HSN_Code: "",
//                         openingCombineTotal: 0,
//                         pTotalPrice: 0,
//                         avgPurchaseRate: 0,
//                         totalPurchaseData: 0,
//                         pendingStock: 0,
//                         pendingRate: 0,
//                         pendingStockTotal: 0,
//                         sRate: 0,
//                         sTotal: 0,
//                         closingQty: 0,
//                         closingAveRate: 0,
//                         closingTotal: 0,
//                         totalTax: 0
//                     };
//                 }

//                 const entry = productMap[productId];

//                 if (status === 'completed') {
//                     entry.sQty += qty;
//                     entry.sTotal += sTotal;
//                 } else {
//                     entry.pendingStock += qty;
//                     entry.pendingStockTotal += sTotal;
//                 }
//             }
//         }
//         const productList = await Product.find({ _id: { $in: Array.from(allProductIds) } });
//         for (const product of productList) {
//             const id = product._id.toString();
//             const entry = productMap[id];
//             if (entry) {
//                 entry.openingRate = product.openingRate || 0;
//                 entry.oQty = product.Opening_Stock || 0;
//                 entry.Product_Title = product.Product_Title || "";
//                 entry.HSN_Code = product.HSN_Code || "";

//                 entry.openingCombineTotal = entry.openingRate * entry.oQty;

//                 entry.avgPurchaseRate = entry.pQty > 0
//                     ? (entry.pTotalPrice + entry.totalTax) / entry.pQty
//                     : 0;

//                 entry.sRate = entry.sQty > 0
//                     ? entry.sTotal / entry.sQty
//                     : 0;

//                 entry.pendingRate = entry.pendingStockTotal + entry.pendingStock;

//                 entry.closingQty = entry.oQty + entry.pQty - entry.pendingStock - entry.sQty;
//                 const totalQty = entry.oQty + entry.pQty;
//                 entry.closingAveRate = totalQty > 0
//                     ? (entry.openingCombineTotal + entry.totalPurchaseData) / totalQty
//                     : 0;

//                 entry.closingTotal = entry.closingQty * entry.closingAveRate;
//             }
//         }

//         const stockReport = Object.values(productMap);
//         const totalSummary = stockReport.reduce((acc, item) => {
//             acc.Product_Title="Total";
//             acc.pQty += item.pQty || 0;
//             acc.purchasePendingQty += item.purchasePendingQty || 0;
//             acc.sQty += item.sQty || 0;
//             acc.oQty += item.oQty || 0;
//             acc.openingCombineTotal += item.openingCombineTotal || 0;
//             acc.pTotalPrice += item.pTotalPrice || 0;
//             acc.totalPurchaseData += item.totalPurchaseData || 0;
//             acc.pendingStock += item.pendingStock || 0;
//             acc.pendingStockTotal += item.pendingStockTotal || 0;
//             acc.pendingRate += item.pendingRate || 0;
//             acc.sTotal += item.sTotal || 0;
//             acc.closingQty += item.closingQty || 0;
//             acc.closingTotal += item.closingTotal || 0;
//             acc.totalTax += item.totalTax || 0;
//             return acc;
//         }, {
//             pQty: 0,
//             purchasePendingQty: 0,
//             sQty: 0,
//             oQty: 0,
//             openingCombineTotal: 0,
//             pTotalPrice: 0,
//             totalPurchaseData: 0,
//             pendingStock: 0,
//             pendingStockTotal: 0,
//             pendingRate: 0,
//             sTotal: 0,
//             closingQty: 0,
//             closingTotal: 0,
//             totalTax: 0
//         });

//         return res.status(200).json({
//             message: "Stock report generated successfully",
//             status: true,
//             data: stockReport,
//             totalSummary
//         });
//     } catch (error) {
//         console.error(error);
//         return res.status(500).json({
//             message: "Internal Server Error",
//             error: error.message,
//             status: false
//         });
//     }
// };

export const stockReport = async (req, res, next) => {
  try {
    const { database } = req.params;

    const purchaseOrders = await PurchaseOrder.find({
      database,
      status: { $ne: "Deactive" },
    });
    const salesOrders = await CreateOrder.find({
      database,
      status: { $ne: "Deactive" },
    });
    const productMap = {};
    const allProductIds = new Set();

    for (const po of purchaseOrders) {
      const status = po.status || "pending";
      const totalTax =
        status === "completed"
          ? (po.coolieAndCartage || 0) +
            (po.labourCost || 0) +
            (po.localFreight || 0) +
            (po.miscellaneousCost || 0) +
            (po.transportationCost || 0) +
            (po.tax || 0)
          : 0;

      for (const item of po.orderItems) {
        const productId = item.productId?.toString();
        if (!productId) continue;

        allProductIds.add(productId);
        const qty = item.qty || 0;
        const totalPrice = item.totalPrice || 0;

        if (!productMap[productId]) {
          productMap[productId] = {
            productId,
            pQty: 0,
            purchasePendingQty: 0,
            sQty: 0,
            openingRate: 0,
            oQty: 0,
            Product_Title: "",
            HSN_Code: "",
            openingCombineTotal: 0,
            pTotalPrice: 0,
            avgPurchaseRate: 0,
            totalPurchaseData: 0,
            pendingStock: 0,
            pendingRate: 0,
            pendingStockTotal: 0,
            sRate: 0,
            sTotal: 0,
            closingQty: 0,
            closingAveRate: 0,
            closingTotal: 0,
            totalTax: 0,
          };
        }

        const entry = productMap[productId];

        if (status === "completed") {
          entry.pQty += qty;
          entry.pTotalPrice += totalPrice;
          entry.totalTax += totalTax;
          entry.totalPurchaseData += totalPrice + totalTax;
        } else {
          entry.purchasePendingQty += qty;
        }
      }
    }
    for (const so of salesOrders) {
      const status = so.status || "pending";

      for (const item of so.orderItems) {
        const productId = item.productId?.toString();
        if (!productId) continue;

        allProductIds.add(productId);
        const qty = item.qty || 0;
        const sTotal = item.totalPrice || 0;

        if (!productMap[productId]) {
          productMap[productId] = {
            productId,
            pQty: 0,
            purchasePendingQty: 0,
            sQty: 0,
            openingRate: 0,
            oQty: 0,
            Product_Title: "",
            HSN_Code: "",
            openingCombineTotal: 0,
            pTotalPrice: 0,
            avgPurchaseRate: 0,
            totalPurchaseData: 0,
            pendingStock: 0,
            pendingRate: 0,
            pendingStockTotal: 0,
            sRate: 0,
            sTotal: 0,
            closingQty: 0,
            closingAveRate: 0,
            closingTotal: 0,
            totalTax: 0,
          };
        }

        const entry = productMap[productId];

        if (status === "completed") {
          entry.sQty += qty;
          entry.sTotal += sTotal;
        } else {
          entry.pendingStock += qty;
          entry.pendingStockTotal += sTotal;
        }
      }
    }

    const productList = await Product.find({ database, status: "Active" });

    for (const product of productList) {
      const id = product._id.toString();

      if (!productMap[id]) {
        productMap[id] = {
          productId: id,
          pQty: 0,
          purchasePendingQty: 0,
          sQty: 0,
          openingRate: 0,
          oQty: 0,
          Product_Title: "",
          HSN_Code: "",
          openingCombineTotal: 0,
          pTotalPrice: 0,
          avgPurchaseRate: 0,
          totalPurchaseData: 0,
          pendingStock: 0,
          pendingRate: 0,
          pendingStockTotal: 0,
          sRate: 0,
          sTotal: 0,
          closingQty: 0,
          closingAveRate: 0,
          closingTotal: 0,
          totalTax: 0,
        };
      }

      const entry = productMap[id];

      entry.openingRate = product.openingRate || 0;
      entry.oQty = product.Opening_Stock || 0;
      entry.Product_Title = product.Product_Title || "";
      entry.HSN_Code = product.HSN_Code || "";
      entry.openingCombineTotal = entry.openingRate * entry.oQty;

      const totalQty = entry.oQty + entry.pQty;

      entry.avgPurchaseRate =
        entry.pQty > 0 ? (entry.pTotalPrice + entry.totalTax) / entry.pQty : 0;

      entry.sRate = entry.sQty > 0 ? entry.sTotal / entry.sQty : 0;

      entry.pendingRate = entry.pendingStockTotal + entry.pendingStock;

      entry.closingQty =
        entry.oQty + entry.pQty - entry.pendingStock - entry.sQty;

      entry.closingAveRate =
        totalQty > 0
          ? (entry.openingCombineTotal + entry.totalPurchaseData) / totalQty
          : 0;

      entry.closingTotal = entry.closingQty * entry.closingAveRate;
    }
    const stockReport = Object.values(productMap);

    const totalSummary = stockReport.reduce(
      (acc, item) => {
        acc.Product_Title = "Total";
        acc.pQty += item.pQty || 0;
        acc.purchasePendingQty += item.purchasePendingQty || 0;
        acc.sQty += item.sQty || 0;
        acc.oQty += item.oQty || 0;
        acc.openingCombineTotal += item.openingCombineTotal || 0;
        acc.pTotalPrice += item.pTotalPrice || 0;
        acc.totalPurchaseData += item.totalPurchaseData || 0;
        acc.pendingStock += item.pendingStock || 0;
        acc.pendingStockTotal += item.pendingStockTotal || 0;
        acc.pendingRate += item.pendingRate || 0;
        acc.sTotal += item.sTotal || 0;
        acc.closingQty += item.closingQty || 0;
        acc.closingTotal += item.closingTotal || 0;
        acc.totalTax += item.totalTax || 0;
        return acc;
      },
      {
        pQty: 0,
        purchasePendingQty: 0,
        sQty: 0,
        oQty: 0,
        openingCombineTotal: 0,
        pTotalPrice: 0,
        totalPurchaseData: 0,
        pendingStock: 0,
        pendingStockTotal: 0,
        pendingRate: 0,
        sTotal: 0,
        closingQty: 0,
        closingTotal: 0,
        totalTax: 0,
      }
    );

    return res.status(200).json({
      message: "Stock report generated successfully",
      status: true,
      data: stockReport,
      totalSummary,
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
