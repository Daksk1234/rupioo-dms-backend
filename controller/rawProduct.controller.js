import { RawProduct } from "../model/rawProduct.model.js";
import { Warehouse } from "../model/warehouse.model.js";
import { CreateOrder } from "../model/createOrder.model.js";
import { PurchaseOrder } from "../model/purchaseOrder.model.js";
import { CustomerGroup } from "../model/customerGroup.model.js";
import { Stock } from "../model/stock.js";
import { User } from "../model/user.model.js";
import { ProductionProductSection } from "../model/productionProductSection.model.js";

export const addRawProduct = async (req, res) => {
  try {
    // let groupDiscount = 0;
    if (req.body.id) {
      const existing = await RawProduct.findOne({
        status: "Active",
        database: req.body.database,
        id: req.body.id,
      });
      if (existing) {
        return res
          .status(404)
          .json({ message: "id already exist", status: false });
      }
    } else {
      return res
        .status(400)
        .json({ message: "product id required", status: false });
    }
    // const group = await CustomerGroup.find({
    //   database: req.body.database,
    //   status: "Active",
    // });

    // if (group.length > 0) {
    //   const maxDiscount = group.reduce((max, group) => {
    //     return group.discount > max.discount ? group : max;
    //   });
    //   groupDiscount = maxDiscount.discount;
    // }
    // if (req.files) {
    //   let images = [];
    //   req.files.map((file) => {
    //     images.push(file.filename);
    //   });
    //   req.body.Product_image = images;
    // }
    // if (!req.body.ProfitPercentage || req.body.ProfitPercentage === 0) {
    //   req.body.SalesRate = req.body.Purchase_Rate * 1.03;
    //   req.body.Product_MRP =
    //     req.body.SalesRate *
    //     (1 + req.body.GSTRate / 100) *
    //     (1 + groupDiscount / 100);

    //   // const latest = (req.body.SalesRate + (req.body.SalesRate * req.body.GSTRate / 100))
    //   // req.body.Product_MRP = latest + (latest * (groupDiscount) / 100);
    // }

    if (req.body.Opening_Stock) {
      req.body.qty = req.body.Opening_Stock;
    }
    const product = await RawProduct.create(req.body);
    await addProductInWarehouse1(req.body, product.warehouse, product);
    return product
      ? res.status(200).json({
          message: "product save successfully",
          _id: product._id,
          status: true,
        })
      : res
          .status(400)
          .json({ message: "something went wrong", status: false });
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewRawProduct = async (req, res, next) => {
  try {
    // const userId = req.params.id
    const database = req.params.database;
    const product = await RawProduct.find({
      database: database,
      status: "Active",
    })
      .sort({ sortorder: -1 })
      .populate({ path: "warehouse", model: "warehouse" });
    return res.status(200).json({ Product: product, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const ViewRawProductById = async (req, res, next) => {
  try {
    let product = await RawProduct.findById({ _id: req.params.id }).populate({
      path: "warehouse",
      model: "warehouse",
    });
    return product
      ? res.status(200).json({ Product: product, status: true })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const DeleteRawProduct = async (req, res, next) => {
  try {
    const product = await RawProduct.findById({ _id: req.params.id });
    if (!product) {
      return res.status(404).json({ error: "Not Found", status: false });
    }
    product.status = "Deactive";
    await product.save();
    const warehouse = await Warehouse.findOne({
      "productItems.productId": req.params.id,
    });
    if (warehouse) {
      warehouse.productItems = warehouse.productItems.filter(
        (sub) => sub.rawProductId.toString() !== req.params.id
      );
      await warehouse.save();
    }
    return res
      .status(200)
      .json({ message: "delete product successfull", status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal server error", status: false });
  }
};

export const UpdateRawProduct = async (req, res, next) => {
  try {
    let groupDiscount = 0;
    // if (req.files) {
    //   let images = [];
    //   req.files.map((file) => {
    //     images.push(file.filename);
    //   });
    //   req.body.Product_image = images;
    // }
    const productId = req.params.id;
    const existingProduct = await RawProduct.findById(productId);
    if (!existingProduct) {
      return res
        .status(404)
        .json({ error: "product not found", status: false });
    } else {
      //   const group = await CustomerGroup.find({
      //     database: existingProduct.database,
      //     status: "Active",
      //   });
      //   if (group.length > 0) {
      //     const maxDiscount = group.reduce((max, group) => {
      //       return group.discount > max.discount ? group : max;
      //     });
      //     groupDiscount = maxDiscount?.discount ? maxDiscount?.discount : 0;
      //   }
      //   if (parseInt(req.body.Purchase_Rate) > existingProduct.landedCost) {
      //     req.body.landedCost = parseInt(req.body.Purchase_Rate);
      //     req.body.Purchase_Rate = parseInt(req.body.Purchase_Rate);
      //   } else {
      //     req.body.Purchase_Rate = existingProduct.landedCost;
      //   }
      //   if (
      //     !req.body.ProfitPercentage ||
      //     parseInt(req.body.ProfitPercentage) === 0
      //   ) {
      //     req.body.SalesRate = req.body.Purchase_Rate * 1.03;
      //     req.body.ProfitPercentage = 3;
      //     req.body.Product_MRP =
      //       req.body.SalesRate *
      //       (1 + parseInt(req.body.GSTRate) / 100) *
      //       (1 + groupDiscount / 100);
      //   } else {
      //     req.body.SalesRate =
      //       req.body.Purchase_Rate *
      //       (1 + parseInt(req.body.ProfitPercentage) / 100);
      //     req.body.Product_MRP =
      //       req.body.SalesRate *
      //       (1 + parseInt(req.body.GSTRate) / 100) *
      //       (1 + groupDiscount / 100);
      //   }
      if (existingProduct.Opening_Stock !== parseInt(req.body.Opening_Stock)) {
        const qty = req.body.Opening_Stock - existingProduct.Opening_Stock;
        req.body.qty = existingProduct.qty + qty;
        // console.log(" req.body", req.body.warehouse._id)
        await addProductInWarehouse(
          req.body,
          req.body.warehouse._id,
          existingProduct
        );
      }

      const updatedProduct = req.body;
      const product = await RawProduct.findByIdAndUpdate(
        productId,
        updatedProduct,
        { new: true }
      );
      return res
        .status(200)
        .json({ message: "Product Updated Successfully", status: true });
    }
  } catch (err) {
    console.error(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const addProductInWarehouse1 = async (warehouse, warehouseId, id) => {
  try {
    const user = await Warehouse.findById({ _id: warehouseId });
    if (!user) {
      return console.log("warehouse not found");
    }
    // console.log("  add  time id._id", id._id);
    const sourceProductItem = user.productItems.find(
      (pItem) => pItem.rawProductId === id._id.toString()
    );
    // console.log("sourceProductItem", sourceProductItem);
    // console.log("warehouse.qty", warehouse.qty);
    if (sourceProductItem) {
      // console.log("if condition");
      // sourceProductItem.Size += warehouse.Size;
      sourceProductItem.currentStock = warehouse.qty;
      //   sourceProductItem.price = warehouse.Purchase_Rate;
      //   sourceProductItem.totalPrice = warehouse.qty * warehouse.Purchase_Rate;
      sourceProductItem.transferQty = warehouse.qty;
      user.markModified("productItems");
      await user.save();
    } else {
      let ware = {
        rawProductId: id._id.toString(),
        // Size: warehouse.Size,
        // unitType: warehouse.unitType,
        primaryUnit: warehouse.primaryUnit,
        secondaryUnit: warehouse.secondaryUnit,
        secondarySize: warehouse.secondarySize,
        currentStock: warehouse.qty,
        transferQty: warehouse.qty,
        // price: warehouse.Purchase_Rate,
        // totalPrice: warehouse.qty * warehouse.Purchase_Rate,
        // gstPercentage: warehouse.GSTRate,
        // igstType: warehouse.igstType,
        oQty: warehouse.qty,
        //     oRate: warehouse.Purchase_Rate,
        //     oBAmount:
        //       (warehouse.qty * warehouse.Purchase_Rate * 100) /
        //       (warehouse.GSTRate + 100),
        //     oTaxRate: warehouse.GSTRate,
        //     oTotal: warehouse.qty * warehouse.Purchase_Rate,
      };
      const updated = await Warehouse.updateOne(
        { _id: warehouseId },
        { $push: { productItems: ware } },
        { upsert: true }
      );
    }
  } catch (error) {
    console.error(error);
  }
};

export const addProductInWarehouse = async (
  warehouse,
  warehouseId,
  productId
) => {
  try {
    const user = await Warehouse.findById({ _id: warehouseId });
    if (!user) {
      return console.log("warehouse not found");
    }
    // console.log("productId._id", productId._id);
    const sourceProductItem = user.productItems.find(
      (pItem) => pItem.rawProductId === productId._id.toString()
    );
    // console.log("update-sourceProductItem", sourceProductItem);
    if (sourceProductItem) {
      //   sourceProductItem.gstPercentage = parseInt(warehouse.GSTRate);
      sourceProductItem.currentStock = parseInt(warehouse.qty);
      //   sourceProductItem.price = parseInt(warehouse.Purchase_Rate);
      //   sourceProductItem.totalPrice =
      //     parseInt(warehouse.qty) * parseInt(warehouse.Purchase_Rate);
      sourceProductItem.transferQty = parseInt(warehouse.qty);
      sourceProductItem.oQty = parseInt(warehouse.Opening_Stock);
      //   sourceProductItem.oRate = parseInt(warehouse.Purchase_Rate);
      //   sourceProductItem.oBAmount =
      //     (parseInt(warehouse.Opening_Stock) *
      //       parseInt(warehouse.Purchase_Rate) *
      //       100) /
      //     (parseInt(warehouse.GSTRate) + 100);
      //   sourceProductItem.oTaxRate = parseInt(warehouse.GSTRate);
      //   sourceProductItem.oTotal =
      //     parseInt(warehouse.Opening_Stock) * parseInt(warehouse.Purchase_Rate);
      //
      user.markModified("productItems");
      await user.save();
    }
  } catch (error) {
    console.error(error);
  }
};

export const viewRawCurrentStock = async (req, res, next) => {
  try {
    const { id, productId } = req.params;
    const warehouse = await Warehouse.findById(id);
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "warehouse not found", status: false });
    }
    const rawProductItem = warehouse.productItems.find(
      (item) => item.rawProductId === productId
    );
    const MainProductItem = warehouse.productItems.find(
      (item) => item.productId === productId
    );
    const productItem = rawProductItem ? rawProductItem : MainProductItem;
    if (!rawProductItem && !MainProductItem) {
      return res
        .status(404)
        .json({ message: "Product not found in the warehouse", status: false });
    }
    return res.status(200).json({ currentStock: productItem, status: true });
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const updateRawProductStep = async (req, res, next) => {
  try {
    const { products } = req.body;
    if (products.length > 0) {
      for (let item of products) {
        const product = await RawProduct.findById(item.id);
        product.NextSubStep = item.NextSubStep;
        product.save();
      }
      res.status(200).json({ message: "Steps updated", status: true });
    } else {
      return res.status(404).json({ message: "Invalid Data", status: false });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const saveProductionProductSection = async (req, res) => {
  try {
    const user = await User.findById({ _id: req.body.created_by });
    if (!user) {
      return res.status(400).json({ message: "User Not Found", status: false });
    }
    req.body.database = user.database;
    const existingProductionProductSection =
      await ProductionProductSection.findOne({
        name: req.body.name,
        database: req.body.database,
        status: "Active",
      });
    if (existingProductionProductSection) {
      return res
        .status(400)
        .json({ message: "product section already existing", status: false });
    }
    const productionProductSection = await ProductionProductSection.create(
      req.body
    );
    return productionProductSection
      ? res
          .status(200)
          .json({ message: "product section save successfully", status: true })
      : res
          .status(400)
          .json({ message: "something went wrong", status: false });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error, status: false });
  }
};
export const ViewProductionProductSection = async (req, res, next) => {
  try {
    const userId = req.params.id;
    // const adminDetail = await getCategoryHierarchy(userId);
    // const adminDetail = adminDetails.length === 1 ? adminDetails[0] : adminDetails;
    const database = req.params.database;
    // const adminDetail = await getUserHierarchyBottomToTop(userId, database)
    // if (!adminDetail.length > 0) {
    //     return res.status(404).json({ error: "Category Not Found", status: false })
    // }
    let productionProductSections = await ProductionProductSection.find({
      database: database,
      status: "Active",
    }).sort({ sortorder: -1 });
    return productionProductSections
      ? res.status(200).json({
          ProductionProductSection: productionProductSections,
          status: true,
        })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err, status: false });
  }
};
export const ViewProductionProductSectionById = async (req, res, next) => {
  try {
    let productionProductSections = await ProductionProductSection.findById({
      _id: req.params.id,
    }).sort({
      sortorder: -1,
    });
    return productionProductSections
      ? res
          .status(200)
          .json({
            ProductionProductSection: productionProductSections,
            status: true,
          })
      : res.status(404).json({ error: "Not Found", status: false });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err, status: false });
  }
};
export const DeleteProductionProductSection = async (req, res, next) => {
  try {
    const productionProductSections = await ProductionProductSection.findById({
      _id: req.params.id,
    });
    if (!productionProductSections) {
      return res.status(404).json({ error: "Not Found", status: false });
    }
    productionProductSections.status = "Deactive";
    await productionProductSections.save();
    return res.status(200).json({ message: "delete successful", status: true });
  } catch (err) {
    console.log(err);
    return res.status(500).json({ error: err, status: false });
  }
};
export const UpdateProductionProductSection = async (req, res, next) => {
  try {
    const productionProductSectionId = req.params.id;
    const existingProductionProductSection =
      await ProductionProductSection.findById(productionProductSectionId);
    if (!existingProductionProductSection) {
      return res
        .status(404)
        .json({ error: "product section not found", status: false });
    } else {
      const updatedProductionProductSection = req.body;
      await ProductionProductSection.findByIdAndUpdate(
        productionProductSectionId,
        updatedProductionProductSection,
        {
          new: true,
        }
      );
      return res.status(200).json({
        message: "Product Section Updated Successfully",
        status: true,
      });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err, status: false });
  }
};
