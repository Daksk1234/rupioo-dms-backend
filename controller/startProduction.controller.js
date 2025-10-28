import { RawProduct } from "../model/rawProduct.model.js";
import { StartProduction } from "../model/startProduction.model.js";
import { Warehouse } from "../model/warehouse.model.js";

export const createProduction = async (req, res, next) => {
  try {
    const { product_details } = req.body;
    for (const item of product_details) {
      if (item?.rProduct_name) {
        await updateProductQty(
          item?.rProduct_name,
          item?.rProduct_name_Units,
          "deduct",
          res
        );
      }

      if (item?.finalProductDetails) {
        for (let item1 of item?.finalProductDetails) {
          await updateProductQty(
            item1?.fProduct_name,
            item1?.fProduct_name_Units,
            "add",
            res
          );
        }
      }

      if (item?.wastageProductDetails) {
        for (let item1 of item?.wastageProductDetails) {
          await updateProductQty(
            item1?.wProduct_name,
            item1?.wProduct_name_Units,
            "add",
            res
          );
        }
      }
    }

    const product = await StartProduction.create(req.body);
    return product
      ? res.status(200).json({ message: "Data Added", status: true })
      : res
          .status(404)
          .json({ message: "Something Went Wrong", status: false });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

const updateProductQty = async (productId, productUnits, actionType, res) => {
  const product = await RawProduct.findById(productId);
  if (!product) {
    return res
      .status(404)
      .json({ message: "Product not found", status: false });
  }
  for (const unit of productUnits) {
    if (unit.unit === product.stockUnit) {
      if (actionType === "deduct") {
        product.qty -= unit.value;
        await product.save();
        await productionlapseWarehouse(
          unit.value,
          product.warehouse,
          productId
        );
      } else if (actionType === "add") {
        product.qty += unit.value;
        await product.save();
        await productionAddWarehouse(unit.value, product.warehouse, productId);
      }
    }
  }
};

export const viewProduct = async (req, res, next) => {
  try {
    const product = await StartProduction.find({
      database: req.params.database,
    })
      .sort({ sortorder: -1 })
      .populate({ path: "product_details.user_name", model: "user" })
      .populate({
        path: "product_details.finalProductDetails.fProduct_name",
        model: "rawProduct",
      })
      .populate({ path: "product_details.rProduct_name", model: "rawProduct" })
      .populate({
        path: "product_details.wastageProductDetails.wProduct_name",
        model: "rawProduct",
      })
      .populate({ path: "processName", model: "category" });

    // const products = await StartProduction.aggregate([
    //   {
    //     $group: {
    //       _id: "$processName",
    //       count: { $sum: 1 },
    //     },
    //   },
    //   {
    //     $match: {
    //       count: { $gt: 1 },
    //     },
    //   },
    // ]);
    // console.log(products);

    // const result = await StartProduction.aggregate([
    //   {
    //     $lookup: {
    //       from: "steps",
    //       localField: "processName",
    //       foreignField: "processName",
    //       as: "processDetails",
    //     },
    //   },
    //   {
    //     $unwind: "$processDetails",
    //   },
    //   {
    //     $group: {
    //       _id: "$processName",
    //       count: { $sum: 1 },
    //       details: { $push: "$processDetails" },
    //     },
    //   },
    //   {
    //     $match: {
    //       count: { $gt: 1 },
    //     },
    //   },
    // ]);
    // console.log("result", result);

    return product.length > 0
      ? res.status(200).json({ message: "Data Found", product, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const viewByIdProduct = async (req, res, next) => {
  try {
    const product = await StartProduction.findById(req.params.id).populate({
      path: "product_details.user_name",
      model: "user",
    });
    return product
      ? res.status(200).json({ message: "Data Found", product, status: true })
      : res.status(404).json({ message: "Not Found", status: false });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;
    const FindProduct = await StartProduction.findById(id);
    if (!FindProduct) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    for (const item of FindProduct.product_details) {
      await handleProductRevert(item);
    }
    await StartProduction.findByIdAndDelete(id);
    res.status(200).json({ message: "Data Deleted", status: true });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

export const deleteNestedProduct = async (req, res, next) => {
  try {
    const { id, innerId } = req.params;
    const parentProduct = await StartProduction.findById(id);

    if (!parentProduct) {
      return res
        .status(404)
        .json({ message: "Parent data not found", status: false });
    }

    const findIndex = parentProduct.product_details.findIndex(
      (item) => item._id.toString() === innerId
    );

    if (findIndex !== -1) {
      await handleProductRevert(parentProduct.product_details[findIndex]);
      parentProduct.product_details.splice(findIndex, 1);
      await parentProduct.save();
      if (parentProduct.product_details.length === 0) {
        await StartProduction.findByIdAndDelete(id);
        return res.status(200).json({
          message: "Production Step With Parent Data Deleted",
          status: true,
        });
      }
      return res.status(200).json({
        message: "Production Step deleted successfully",
        status: true,
      });
    } else {
      return res.status(404).json({
        error: "Nested productionStep not found",
        status: false,
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error", status: false });
  }
};

const handleProductRevert = async (item) => {
  if (item?.rProduct_name && item?.rProduct_name_Units.length > 0) {
    const Rowproduct = await RawProduct.findById(item.rProduct_name);
    await revertStockUnits(item?.rProduct_name_Units, Rowproduct, "add");
    console.log(revertStockUnits || 0);
  }
  if (item?.finalProductDetails && item?.finalProductDetails.length > 0) {
    for (let item1 of item?.finalProductDetails) {
      if (item1?.fProduct_name && item1?.fProduct_name_Units?.length > 0) {
        const Rowproduct = await RawProduct.findById(item1?.fProduct_name);
        await revertStockUnits(
          item1?.fProduct_name_Units,
          Rowproduct,
          "deduct"
        );
      }
    }
  }
  if (item?.wastageProductDetails && item?.wastageProductDetails.length > 0) {
    for (let item1 of item?.wastageProductDetails) {
      if (item1?.wProduct_name && item1?.wProduct_name_Units.length > 0) {
        const Rowproduct = await RawProduct.findById(item1.wProduct_name);
        await revertStockUnits(
          item1?.wProduct_name_Units,
          Rowproduct,
          "deduct"
        );
      }
    }
  }
};

const revertStockUnits = async (units, product, actionType) => {
  if (units.length > 0) {
    for (const unit of units) {
      if (unit.unit === product.stockUnit) {
        product.qty =
          actionType === "add"
            ? product.qty + unit.value
            : product.qty - unit.value;
        await product.save();
        await (actionType === "add"
          ? productionAddWarehouse(unit.value, product.warehouse, product._id)
          : productionlapseWarehouse(
              unit.value,
              product.warehouse,
              product._id
            ));
      }
    }
  } else {
    console.error("Expected 'units' to be an array, but got:", units);
  }
};

export const updateProduct = async (req, res, next) => {
  try {
    const id = req.params.id;
    const Productfind = await StartProduction.findById(id);

    if (!Productfind) {
      return res.status(404).json({ message: "Not Found", status: false });
    }
    const { product_details } = req.body;
    const processRowProductUpdate = async (
      item,
      productType,
      typeUnits,
      Action,
      qty
    ) => {
      if (item[productType]) {
        const Rowproduct = await RawProduct.findById(item[productType]);
        if (Rowproduct) {
          await Promise.all(
            item[typeUnits].map(async (data) => {
              if (data.unit === Rowproduct.stockUnit) {
                Rowproduct.qty += Action === "Lapse" ? -qty : qty;
                const warehouseFunc =
                  Action === "Add"
                    ? productionAddWarehouse
                    : productionlapseWarehouse;
                await warehouseFunc(
                  Math.abs(qty),
                  Rowproduct.warehouse,
                  item[productType]
                );
                await Rowproduct.save();
              }
            })
          );
        }
      }
    };
    const updateProductDetails = async () => {
      const existingProductDetails = Productfind.product_details;
      if (product_details.length > existingProductDetails.length) {
        console.log("Current product list is greater than existing products.");
        for (let i = 0; i < product_details.length; i++) {
          const item = product_details[i];
          const existingItem = existingProductDetails[i];
          if (!existingItem) {
            if (item.rProduct_name) {
              const RowRProduct = await RawProduct.findById(item.rProduct_name);
              const rProductQtyTotal = item.rProduct_name_Units
                ? item.rProduct_name_Units.reduce((total, unit) => {
                    return unit.unit === RowRProduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              await processRowProductUpdate(
                item,
                "rProduct_name",
                "rProduct_name_Units",
                "Lapse",
                rProductQtyTotal
              );
            }

            if (item.fProduct_name) {
              const RowFProduct = await RawProduct.findById(item.fProduct_name);
              const fProductQtyTotal = item.fProduct_name_Units
                ? item.fProduct_name_Units.reduce((total, unit) => {
                    return unit.unit === RowFProduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              await processRowProductUpdate(
                item,
                "fProduct_name",
                "fProduct_name_Units",
                "Add",
                fProductQtyTotal
              );
            }
            if (item.wProduct_name) {
              const RowWProduct = await RawProduct.findById(item.wProduct_name);
              const wProductQtyTotal = item.wProduct_name_Units
                ? item.wProduct_name_Units.reduce((total, unit) => {
                    return unit.unit === RowWProduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              await processRowProductUpdate(
                item,
                "wProduct_name",
                "wProduct_name_Units",
                "Add",
                wProductQtyTotal
              );
            }
            continue;
          }

          const processProductType = async (productType, unitType, action) => {
            if (item[productType] && existingItem[productType]) {
              const Rowproduct = await RawProduct.findById(item[productType]);

              const existingQty = existingItem[unitType]
                ? existingItem[unitType].reduce((total, unit) => {
                    return unit.unit === Rowproduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              console.log("[productType]", [productType]);
              console.log("existingQty", existingQty);
              const currentQty = item[unitType]
                ? item[unitType].reduce((total, unit) => {
                    return unit.unit === Rowproduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              console.log("currentQty", currentQty);

              const qtyDifference = Math.abs(existingQty - currentQty);

              if (existingQty > currentQty) {
                if (productType === "rProduct_name") {
                  console.log(
                    `Existing ${productType} quantity is greater; Adding difference:`,
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Add",
                    qtyDifference
                  );
                } else {
                  console.log(
                    `Existing ${productType} quantity is greater; Lapse difference:`,
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Lapse",
                    qtyDifference
                  );
                }
              } else {
                if (productType === "rProduct_name") {
                  console.log(
                    `Current ${productType} quantity is greater or equal; Lapsing difference:`,
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Lapse",
                    qtyDifference
                  );
                } else {
                  console.log(
                    `Current ${productType} quantity is greater or equal; Adding difference:`,
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Add",
                    qtyDifference
                  );
                }
              }
            } else {
              console.log(
                `Product ${productType} does not match. Lapsing current quantity:`,
                item[unitType]
              );
              const currentQtyTotal = item[unitType]
                ? item[unitType].reduce((total, unit) => total + unit.value, 0)
                : 0;
              console.log("currentQty", currentQtyTotal);
              await processRowProductUpdate(
                item,
                productType,
                unitType,
                "Lapse",
                currentQtyTotal
              );
            }
          };
          await processProductType(
            "rProduct_name",
            "rProduct_name_Units",
            "Lapse"
          );
          await processProductType(
            "fProduct_name",
            "fProduct_name_Units",
            "Add"
          );
          await processProductType(
            "wProduct_name",
            "wProduct_name_Units",
            "Add"
          );
        }
      } else if (product_details.length < existingProductDetails.length) {
        console.log("Calling existing product greater than current product");
        for (let i = 0; i < existingProductDetails.length; i++) {
          const item = existingProductDetails[i];
          const currentItem = product_details[i];
          if (!currentItem) {
            if (item.rProduct_name) {
              const RowRProduct = await RawProduct.findById(item.rProduct_name);
              const rProductQtyTotal = item.rProduct_name_Units
                ? item.rProduct_name_Units.reduce((total, unit) => {
                    return unit.unit === RowRProduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              await processRowProductUpdate(
                item,
                "rProduct_name",
                "rProduct_name_Units",
                "Add",
                rProductQtyTotal
              );
            }

            if (item.fProduct_name) {
              const RowFProduct = await RawProduct.findById(item.fProduct_name);
              const fProductQtyTotal = item.fProduct_name_Units
                ? item.fProduct_name_Units.reduce((total, unit) => {
                    return unit.unit === RowFProduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              await processRowProductUpdate(
                item,
                "fProduct_name",
                "fProduct_name_Units",
                "Lapse",
                fProductQtyTotal
              );
            }

            if (item.wProduct_name) {
              const RowWProduct = await RawProduct.findById(item.wProduct_name);
              const wProductQtyTotal = item.wProduct_name_Units
                ? item.wProduct_name_Units.reduce((total, unit) => {
                    return unit.unit === RowWProduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              await processRowProductUpdate(
                item,
                "wProduct_name",
                "wProduct_name_Units",
                "Lapse",
                wProductQtyTotal
              );
            }

            continue;
          }
          const processProductType = async (productType, unitType, action) => {
            if (item[productType] && currentItem[productType]) {
              const Rowproduct = await RawProduct.findById(item[productType]);

              const existingQty = currentItem[unitType]
                ? currentItem[unitType].reduce((total, unit) => {
                    return unit.unit === Rowproduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              console.log("[productType]", [productType]);
              console.log("existingQty", existingQty);
              const currentQty = item[unitType]
                ? item[unitType].reduce((total, unit) => {
                    return unit.unit === Rowproduct.stockUnit
                      ? total + unit.value
                      : total;
                  }, 0)
                : 0;
              console.log("currentQty", currentQty);

              const qtyDifference = Math.abs(existingQty - currentQty);

              if (existingQty > currentQty) {
                if (productType === "rProduct_name") {
                  console.log(
                    "Existing quantity is greater; Adding difference:",
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Add",
                    qtyDifference
                  );
                } else {
                  console.log(
                    "Existing quantity is greater; Lapse difference:",
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Lapse",
                    qtyDifference
                  );
                }
              } else {
                if (productType === "rProduct_name") {
                  console.log(
                    "Current quantity is greater or equal; Lapsing difference:",
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Lapse",
                    qtyDifference
                  );
                } else {
                  console.log(
                    "Current quantity is greater or equal; Adding difference",
                    qtyDifference
                  );
                  await processRowProductUpdate(
                    item,
                    productType,
                    unitType,
                    "Add",
                    qtyDifference
                  );
                }
              }
            } else {
              console.log(
                "Product does not match. Lapsing current quantity:",
                item[unitType]
              );
              const currentQtyTotal = item[unitType]
                ? item[unitType].reduce((total, unit) => total + unit.value, 0)
                : 0;
              console.log("currentQtyTotal", currentQtyTotal);
              await processRowProductUpdate(
                item,
                productType,
                unitType,
                "Lapse",
                currentQtyTotal
              );
            }
          };
          await processProductType(
            "rProduct_name",
            "rProduct_name_Units",
            "Add"
          );
          await processProductType(
            "fProduct_name",
            "fProduct_name_Units",
            "Lapse"
          );
          await processProductType(
            "wProduct_name",
            "wProduct_name_Units",
            "Lapse"
          );
        }
      } else {
        await Promise.all(
          product_details.map(async (item) => {
            if (item.rProduct_name && item.rProduct_name_Units.length > 0) {
              // console.log("existingProductDetails", existingProductDetails);
              const existingItem = existingProductDetails.find(
                (prod) => prod.rProduct_name === item.rProduct_name
              );
              // console.log("RawProductExitingItem", existingItem);
              if (existingItem) {
                // console.log("call existingItem");
                const Rowproduct = await RawProduct.findById(
                  item.rProduct_name
                );
                const existingQty = existingItem.rProduct_name_Units.reduce(
                  (total, unit) =>
                    unit.unit === Rowproduct.stockUnit
                      ? total + unit.value
                      : total,
                  0
                );
                // console.log("RawExitQty", existingQty);
                const currentQty = item.rProduct_name_Units.reduce(
                  (total, unit) =>
                    unit.unit === Rowproduct.stockUnit
                      ? total + unit.value
                      : total,
                  0
                );
                // console.log("RawCurrentQty", currentQty);
                let qtyDifference = Math.abs(existingQty - currentQty);
                if (existingQty > currentQty) {
                  // console.log("Add Raw qty", qtyDifference);
                  await processRowProductUpdate(
                    item,
                    "rProduct_name",
                    "rProduct_name_Units",
                    "Add",
                    qtyDifference
                  );
                } else if (currentQty > existingQty) {
                  // console.log("lapse Raw qty", qtyDifference);
                  await processRowProductUpdate(
                    item,
                    "rProduct_name",
                    "rProduct_name_Units",
                    "Lapse",
                    qtyDifference
                  );
                }
              } else {
                const Rowproduct = await RawProduct.findById(
                  item.rProduct_name
                );
                // console.log("not RawProduct exiting");
                // console.log(Rowproduct);
                item.rProduct_name_Units.map(async (item1) => {
                  if (Rowproduct.stockUnit == item1.unit) {
                    await processRowProductUpdate(
                      item,
                      "rProduct_name",
                      "rProduct_name_Units",
                      "Lapse",
                      item1.value
                    );
                  }
                });
              }
            }
            if (
              item.finalProductDetails &&
              item?.finalProductDetails.length > 0
            ) {
              for (let product of item?.finalProductDetails)
                if (
                  product.fProduct_name &&
                  product.fProduct_name_Units.length > 0
                ) {
                  // console.log("productFinal", product.fProduct_name);
                  // console.log("unitts", product.fProduct_name_Units);
                  if (
                    existingProductDetails.finalProductDetails &&
                    existingProductDetails.finalProductDetails.length > 0
                  ) {
                    const existingItem =
                      existingProductDetails.finalProductDetails.find(
                        (prod) => prod.fProduct_name === product.fProduct_name
                      );
                    if (existingItem) {
                      const Rowproduct = await RawProduct.findById(
                        product.fProduct_name
                      );
                      //   console.log("Final Exiting", existingItem);
                      //   console.log("Final ", Rowproduct);
                      const existingQty =
                        existingItem.fProduct_name_Units.reduce(
                          (total, unit) =>
                            unit.unit === Rowproduct.stockUnit
                              ? total + unit.value
                              : total,
                          0
                        );
                      const currentQty = product.fProduct_name_Units.reduce(
                        (total, unit) =>
                          unit.unit === Rowproduct.stockUnit
                            ? total + unit.value
                            : total,
                        0
                      );
                      // console.log("current final ", currentQty);
                      let qtyDifference = Math.abs(existingQty - currentQty);
                      if (existingQty > currentQty) {
                        // console.log("lapse final qty", qtyDifference);
                        await processRowProductUpdate(
                          product,
                          "fProduct_name",
                          "fProduct_name_Units",
                          "Lapse",
                          qtyDifference
                        );
                      } else if (currentQty > existingQty) {
                        // console.log("add final qty", qtyDifference);
                        await processRowProductUpdate(
                          product,
                          "fProduct_name",
                          "fProduct_name_Units",
                          "Add",
                          qtyDifference
                        );
                      }
                    } else {
                      const Rowproduct = await RawProduct.findById(
                        product.fProduct_name
                      );
                      // console.log("not  final Product exiting");
                      // console.log("final ", Rowproduct);
                      product.fProduct_name_Units.map(async (item1) => {
                        if (Rowproduct.stockUnit == item1.unit) {
                          await processRowProductUpdate(
                            product,
                            "fProduct_name",
                            "fProduct_name_Units",
                            "Add",
                            item1.value
                          );
                        }
                      });
                    }
                  }
                }
            }
            if (
              item?.wastageProductDetails &&
              item?.wastageProductDetails.length > 0
            ) {
              for (let product of item?.wastageProductDetails) {
                if (
                  product.wProduct_name &&
                  product.wProduct_name_Units.length > 0
                ) {
                  if (
                    existingProductDetails.wastageProductDetails &&
                    existingProductDetails.wastageProductDetails.length > 0
                  ) {
                    const existingItem =
                      existingProductDetails?.wastageProductDetails.find(
                        (prod) => prod.wProduct_name === product.wProduct_name
                      );
                    if (existingItem) {
                      const Rowproduct = await RawProduct.findById(
                        product.wProduct_name
                      );
                      // console.log("wastage Product exiting", existingItem);
                      const existingQty =
                        existingItem.wProduct_name_Units.reduce(
                          (total, unit) =>
                            unit.unit === Rowproduct.stockUnit
                              ? total + unit.value
                              : total,
                          0
                        );
                      // console.log("wastage existingQty", existingQty);
                      const currentQty = product.wProduct_name_Units.reduce(
                        (total, unit) =>
                          unit.unit === Rowproduct.stockUnit
                            ? total + unit.value
                            : total,
                        0
                      );
                      // console.log("currentQty", currentQty);
                      let qtyDifference = Math.abs(existingQty - currentQty);
                      if (existingQty > currentQty) {
                        // console.log("lapse wastage qty", qtyDifference);
                        await processRowProductUpdate(
                          product,
                          "wProduct_name",
                          "wProduct_name_Units",
                          "Lapse",
                          qtyDifference
                        );
                      } else if (currentQty > existingQty) {
                        // console.log("Add wastage qty  ", qtyDifference);
                        await processRowProductUpdate(
                          product,
                          "wProduct_name",
                          "wProduct_name_Units",
                          "Add",
                          qtyDifference
                        );
                      }
                    } else {
                      // console.log("not  wastage Product exiting ");
                      const Rowproduct = await RawProduct.findById(
                        product.wProduct_name
                      );
                      // console.log("not wastage", Rowproduct);
                      // console.log("wastage", Rowproduct);
                      product.wProduct_name_Units.map(async (item1) => {
                        if (Rowproduct.stockUnit == item1.unit) {
                          // console.log(
                          //   "Wastaage",
                          //   Rowproduct.stockUnit,
                          //   item1.unit,
                          //   item1.value
                          // );
                          await processRowProductUpdate(
                            product,
                            "wProduct_name",
                            "wProduct_name_Units",
                            "Add",
                            item1.value
                          );
                        }
                      });
                    }
                  }
                }
              }
            }
          })
        );
      }
    };
    await updateProductDetails();
    const updateData = { product_details };
    await StartProduction.findByIdAndUpdate(id, updateData, { new: true });
    res.status(200).json({ message: "Data Updated", status: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

// export const NestedUpdateProduct = async (req, res, next) => {
//   try {
//     const { id, innerId } = req.params;
//     const { product_details } = req.body;
//     const Productfind = await StartProduction.findById(id);
//     if (!Productfind) {
//       return res
//         .status(404)
//         .json({ message: "Product not found", status: false });
//     }
//     const findIndex = Productfind.product_details.findIndex(
//       (item) => item._id.toString() === innerId
//     );

//     if (findIndex === -1) {
//       return res
//         .status(404)
//         .json({ message: "Inner product not found", status: false });
//     }

//     const existingItem = Productfind.product_details[findIndex];
//     const calculateQtyDifference = (existingUnits, currentUnits, stockUnit) => {
//       const existingQty = existingUnits.reduce(
//         (total, unit) => (unit.unit === stockUnit ? total + unit.value : total),
//         0
//       );
//       const currentQty = currentUnits.reduce(
//         (total, unit) => (unit.unit === stockUnit ? total + unit.value : total),
//         0
//       );
//       return {
//         existingQty,
//         currentQty,
//         qtyDifference: currentQty - existingQty,
//       };
//     };
//     const updateStock = async (
//       item,
//       productType,
//       typeUnits,
//       actionType,
//       qty
//     ) => {
//       if (!item[productType]) return;

//       const Rowproduct = await RawProduct.findById(item[productType]);
//       if (!Rowproduct) return;

//       await Promise.all(
//         item[typeUnits].map(async (unit) => {
//           if (unit.unit === Rowproduct.stockUnit) {
//             Rowproduct.qty += actionType === "Add" ? qty : -qty;

//             const warehouseFunc =
//               actionType === "Add"
//                 ? productionAddWarehouse
//                 : productionlapseWarehouse;

//             await warehouseFunc(
//               Math.abs(qty),
//               Rowproduct.warehouse,
//               item[productType]
//             );
//             await Rowproduct.save();
//           }
//         })
//       );
//     };
//     const processUpdates = async () => {
//       if (
//         product_details.rProduct_name &&
//         existingItem.rProduct_name &&
//         product_details.rProduct_name_Units.length > 0
//       ) {
//         const Rowproduct = await RawProduct.findById(
//           product_details.rProduct_name
//         );
//         if (Rowproduct) {
//           const { existingQty, currentQty, qtyDifference } =
//             calculateQtyDifference(
//               existingItem.rProduct_name_Units,
//               product_details.rProduct_name_Units,
//               Rowproduct.stockUnit
//             );

//           if (qtyDifference > 0) {
//             await updateStock(
//               product_details,
//               "rProduct_name",
//               "rProduct_name_Units",
//               "Add",
//               qtyDifference
//             );
//           } else if (qtyDifference < 0) {
//             await updateStock(
//               product_details,
//               "rProduct_name",
//               "rProduct_name_Units",
//               "Lapse",
//               Math.abs(qtyDifference)
//             );
//           }
//         }
//       }

//       if (product_details.finalProductDetails?.length > 0) {
//         await Promise.all(
//           product_details.finalProductDetails.map(async (product) => {
//             const existingFinal = await existingItem.finalProductDetails?.find(
//               (p) => p.fProduct_name === product.fProduct_name
//             );

//             if (existingFinal) {
//               const Rowproduct = await RawProduct.findById(
//                 product.fProduct_name
//               );
//               if (Rowproduct) {
//                 const { existingQty, currentQty, qtyDifference } =
//                   calculateQtyDifference(
//                     existingFinal.fProduct_name_Units,
//                     product.fProduct_name_Units,
//                     Rowproduct.stockUnit
//                   );

//                 if (qtyDifference > 0) {
//                   await updateStock(
//                     product,
//                     "fProduct_name",
//                     "fProduct_name_Units",
//                     "Add",
//                     qtyDifference
//                   );
//                 } else if (qtyDifference < 0) {
//                   await updateStock(
//                     product,
//                     "fProduct_name",
//                     "fProduct_name_Units",
//                     "Lapse",
//                     Math.abs(qtyDifference)
//                   );
//                 }
//               }
//             } else {
//               console.log("not found final product");
//               const Rowproduct = await RawProduct.findById(
//                 product.fProduct_name
//               );
//               if (Rowproduct) {
//                 const totalQty = product.fProduct_name_Units.reduce(
//                   (sum, unit) =>
//                     unit.unit === Rowproduct.stockUnit ? sum + unit.value : sum,
//                   0
//                 );
//                 console.log("final TotalQty", totalQty);
//                 await updateStock(
//                   product,
//                   "fProduct_name",
//                   "fProduct_name_Units",
//                   "Add",
//                   totalQty
//                 );
//               }
//             }
//           })
//         );
//       }

//       if (product_details.wastageProductDetails?.length > 0) {
//         await Promise.all(
//           product_details.wastageProductDetails.map(async (product) => {
//             const existingWaste =
//               await existingItem.wastageProductDetails?.find(
//                 (p) => p.wProduct_name === product.wProduct_name
//               );

//             if (existingWaste) {
//               const Rowproduct = await RawProduct.findById(
//                 product.wProduct_name
//               );
//               if (Rowproduct) {
//                 const { existingQty, currentQty, qtyDifference } =
//                   calculateQtyDifference(
//                     existingWaste.wProduct_name_Units,
//                     product.wProduct_name_Units,
//                     Rowproduct.stockUnit
//                   );

//                 if (qtyDifference > 0) {
//                   await updateStock(
//                     product,
//                     "wProduct_name",
//                     "wProduct_name_Units",
//                     "Add",
//                     qtyDifference
//                   );
//                 } else if (qtyDifference < 0) {
//                   await updateStock(
//                     product,
//                     "wProduct_name",
//                     "wProduct_name_Units",
//                     "Lapse",
//                     Math.abs(qtyDifference)
//                   );
//                 }
//               }
//             } else {
//               console.log("not found wastage product");
//               const Rowproduct = await RawProduct.findById(
//                 product.wProduct_name
//               );
//               if (Rowproduct) {
//                 const totalQty = product.wProduct_name_Units.reduce(
//                   (sum, unit) =>
//                     unit.unit === Rowproduct.stockUnit ? sum + unit.value : sum,
//                   0
//                 );
//                 console.log("wastage Product qty", totalQty);
//                 await updateStock(
//                   product,
//                   "wProduct_name",
//                   "wProduct_name_Units",
//                   "Add",
//                   totalQty
//                 );
//               }
//             }
//           })
//         );
//       }
//     };

//     await processUpdates();

//     Productfind.product_details[findIndex] = product_details;
//     await Productfind.save();

//     res
//       .status(200)
//       .json({ message: "Data Updated Successfully", status: true });
//   } catch (error) {
//     console.error("Error updating product details:", error);
//     res.status(500).json({ message: "Internal Server Error", status: false });
//   }
// };

export const NestedUpdateProduct = async (req, res, next) => {
  try {
    const { id, innerId } = req.params;
    const { product_details, processName, step_name } = req.body;
    const Productfind = await StartProduction.findById(id);
    if (!Productfind) {
      return res
        .status(404)
        .json({ message: "Product not found", status: false });
    }

    const findIndex = Productfind.product_details.findIndex(
      (item) => item._id.toString() === innerId
    );

    if (findIndex === -1) {
      return res
        .status(404)
        .json({ message: "Inner product not found", status: false });
    }

    const existingItem = Productfind.product_details[findIndex];
    const calculateQtyDifference = (existingUnits, currentUnits, stockUnit) => {
      const existingQty = existingUnits.reduce(
        (total, unit) => (unit.unit === stockUnit ? total + unit.value : total),
        0
      );
      const currentQty = currentUnits.reduce(
        (total, unit) => (unit.unit === stockUnit ? total + unit.value : total),
        0
      );
      return {
        existingQty,
        currentQty,
        qtyDifference: currentQty - existingQty,
      };
    };

    const updateStock = async (
      item,
      productType,
      typeUnits,
      actionType,
      qty
    ) => {
      if (!item[productType]) return;

      const Rowproduct = await RawProduct.findById(item[productType]);
      if (!Rowproduct) return;

      for (const unit of item[typeUnits]) {
        if (unit.unit === Rowproduct.stockUnit) {
          Rowproduct.qty += actionType === "Add" ? qty : -qty;

          const warehouseFunc =
            actionType === "Add"
              ? productionAddWarehouse
              : productionlapseWarehouse;

          await warehouseFunc(
            Math.abs(qty),
            Rowproduct.warehouse,
            item[productType]
          );
          await Rowproduct.save();
        }
      }
    };
    const processUpdates = async () => {
      if (
        product_details.rProduct_name &&
        existingItem.rProduct_name &&
        product_details.rProduct_name_Units.length > 0
      ) {
        const Rowproduct = await RawProduct.findById(
          product_details.rProduct_name
        );
        if (Rowproduct) {
          const { existingQty, qtyDifference } = calculateQtyDifference(
            existingItem.rProduct_name_Units,
            product_details.rProduct_name_Units,
            Rowproduct.stockUnit
          );

          if (qtyDifference !== 0) {
            await updateStock(
              product_details,
              "rProduct_name",
              "rProduct_name_Units",
              qtyDifference > 0 ? "Add" : "Lapse",
              Math.abs(qtyDifference)
            );
          }
        }
      }

      if (product_details.finalProductDetails?.length > 0) {
        for (const product of product_details.finalProductDetails) {
          const existingFinal = existingItem.finalProductDetails?.find(
            (p) => p.fProduct_name === product.fProduct_name
          );

          if (existingFinal) {
            const Rowproduct = await RawProduct.findById(product.fProduct_name);
            if (Rowproduct) {
              const { qtyDifference } = calculateQtyDifference(
                existingFinal.fProduct_name_Units,
                product.fProduct_name_Units,
                Rowproduct.stockUnit
              );

              if (qtyDifference !== 0) {
                await updateStock(
                  product,
                  "fProduct_name",
                  "fProduct_name_Units",
                  qtyDifference > 0 ? "Add" : "Lapse",
                  Math.abs(qtyDifference)
                );
              }
            }
          } else {
            const Rowproduct = await RawProduct.findById(product.fProduct_name);
            if (Rowproduct) {
              const totalQty = product.fProduct_name_Units.reduce(
                (sum, unit) =>
                  unit.unit === Rowproduct.stockUnit ? sum + unit.value : sum,
                0
              );
              await updateStock(
                product,
                "fProduct_name",
                "fProduct_name_Units",
                "Add",
                totalQty
              );
            }
          }
        }
      }

      if (product_details.wastageProductDetails?.length > 0) {
        for (const product of product_details.wastageProductDetails) {
          const existingWaste = existingItem.wastageProductDetails?.find(
            (p) => p.wProduct_name === product.wProduct_name
          );

          if (existingWaste) {
            const Rowproduct = await RawProduct.findById(product.wProduct_name);
            if (Rowproduct) {
              const { qtyDifference } = calculateQtyDifference(
                existingWaste.wProduct_name_Units,
                product.wProduct_name_Units,
                Rowproduct.stockUnit
              );

              if (qtyDifference !== 0) {
                await updateStock(
                  product,
                  "wProduct_name",
                  "wProduct_name_Units",
                  qtyDifference > 0 ? "Add" : "Lapse",
                  Math.abs(qtyDifference)
                );
              }
            }
          } else {
            const Rowproduct = await RawProduct.findById(product.wProduct_name);
            if (Rowproduct) {
              const totalQty = product.wProduct_name_Units
                .reduce(
                  (sum, unit) =>
                    unit.unit === Rowproduct.stockUnit ? sum + unit.value : sum,
                  0
                )
                .toFixed(2);
              await updateStock(
                product,
                "wProduct_name",
                "wProduct_name_Units",
                "Add",
                parseInt(totalQty)
              );
            }
          }
        }
      }
    };

    await processUpdates();
    Productfind.product_details[findIndex] = product_details;
    Productfind.processName = processName;
    Productfind.step_name = step_name;
    await Productfind.save();
    res
      .status(200)
      .json({ message: "Data Updated Successfully", status: true });
  } catch (error) {
    console.error("Error updating product details:", error);
    res.status(500).json({ message: "Internal Server Error", status: false });
  }
};

export const productionlapseWarehouse = async (qty, warehouseId, productId) => {
  try {
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "warehouse not found", status: false });
    }
    const sourceProductItem = warehouse.productItems.find(
      (pItem) => pItem.rawProductId.toString() === productId.toString()
    );
    if (sourceProductItem) {
      sourceProductItem.currentStock -= qty;
      sourceProductItem.transferQty -= qty;
      warehouse.markModified("productItems");
      await warehouse.save();
    }
  } catch (error) {
    console.log(error);
  }
};

export const productionAddWarehouse = async (qty, warehouseId, productId) => {
  try {
    const warehouse = await Warehouse.findById(warehouseId);
    if (!warehouse) {
      return res
        .status(404)
        .json({ message: "warehouse not found", status: false });
    }
    const sourceProductItem = warehouse.productItems.find(
      (pItem) => pItem.rawProductId.toString() === productId.toString()
    );
    if (sourceProductItem) {
      sourceProductItem.currentStock += qty;
      sourceProductItem.transferQty += qty;
      warehouse.markModified("productItems");
      await warehouse.save();
    }
  } catch (error) {
    console.log(error);
  }
};

export const productTarget = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existingProduct = await RawProduct.findById(id);
    if (!existingProduct) {
      return res
        .status(404)
        .json({ message: "Product not found", status: false });
    }
    const existingProductList = await StartProduction.find({});
    let totalStock = 0;
    existingProductList.forEach((item) => {
      item.product_details.forEach((product) => {
        product.finalProductDetails.forEach((data) => {
          if (data.fProduct_name === id) {
            const stocks = data.fProduct_name_Units.reduce((total, unit) => {
              if (unit.unit === existingProduct.stockUnit) {
                return total + unit.value;
              }
              return total;
            }, 0);
            totalStock += stocks;
          }
        });
      });
    });
    return res.status(200).json({
      message: "Current Target Found",
      status: true,
      id: existingProduct._id,
      product: existingProduct.Product_Title,
      totalStock,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};

export const demoCodes = async (req, res, next) => {
  try {
    const { id } = req.params;
    const existingProduct = await RawProduct.findById(id);
    if (!existingProduct) {
      return res
        .status(404)
        .json({ message: "Product not found", status: false });
    }

    const result = await StartProduction.aggregate([
      {
        $unwind: "$product_details",
      },
      {
        $unwind: "$product_details.finalProductDetails",
      },
      {
        $match: {
          "product_details.finalProductDetails.fProduct_name": id,
        },
      },
      {
        $unwind: "$product_details.finalProductDetails.fProduct_name_Units",
      },
      {
        $match: {
          "product_details.finalProductDetails.fProduct_name_Units.unit":
            existingProduct.stockUnit,
        },
      },
      {
        $group: {
          _id: null,
          totalStock: {
            $sum: "$product_details.finalProductDetails.fProduct_name_Units.value",
          },
        },
      },
    ]);
    const totalStock = result.length > 0 ? result[0].totalStock : 0;
    return res.status(200).json({
      message: "Current Target Found",
      status: true,
      id: existingProduct._id,
      product: existingProduct.Product_Title,
      totalStock,
    });
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Internal Server Error", status: false });
  }
};
