// File: controller/hrmPermission.controller.js
import { HrmPermission } from "../model/hrmPermission.model.js";
import { buildController, number } from "./_hrmAdvancedCommon.js";
const c = buildController({
  Model: HrmPermission,
  label: "Permission",
  beforeSave: (row) => {
    if (!row.month && row.date) row.month = String(row.date).slice(0, 7);
    if (row.mcqMarks || row.writtenMarks || row.practicalMarks) row.totalMarks = number(row.mcqMarks) + number(row.writtenMarks) + number(row.practicalMarks);
    if (row.target || row.achievement) row.achievementPercent = number(row.target) ? ((number(row.achievement) / number(row.target)) * 100).toFixed(2) : "0";
    if (row.sales && row.incentivePercent) row.incentive = Math.round((number(row.sales) * number(row.incentivePercent)) / 100);
    if (row.amount || row.approvedAmount) row.balanceAmount = Math.max(number(row.amount) - number(row.approvedAmount || row.amount), 0);
    return row;
  }
});
export const createPermission = c.create;
export const listPermission = c.list;
export const viewPermission = c.view;
export const updatePermission = c.update;
export const transitionPermission = c.transition;
export const deletePermission = c.remove;
export const reportPermission = c.report;
