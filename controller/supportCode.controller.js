import SupportCode from "../model/supportCode.model.js";

const generateSixDigitCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const generateUniqueSupportCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    code = generateSixDigitCode();
    exists = await SupportCode.findOne({ code });
  }

  return code;
};

export const generateSupportCode = async (req, res) => {
  try {
    const { database } = req.body;

    if (!database) {
      return res.status(400).json({
        status: false,
        message: "Database is required",
      });
    }

    const existingCode = await SupportCode.findOne({ database });

    if (existingCode) {
      return res.status(200).json({
        status: true,
        message: "Support code already generated",
        database: existingCode.database,
        code: existingCode.code,
        existing: true,
      });
    }

    const code = await generateUniqueSupportCode();

    const supportCode = await SupportCode.create({
      database,
      code,
    });

    return res.status(201).json({
      status: true,
      message: "Support code generated successfully",
      database: supportCode.database,
      code: supportCode.code,
      existing: false,
    });
  } catch (error) {
    console.error("Generate support code error:", error);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

export const verifySupportCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        status: false,
        connected: false,
        message: "Code is required",
      });
    }

    const cleanCode = code.toString().trim();

    const supportCode = await SupportCode.findOne({ code: cleanCode });

    if (!supportCode) {
      return res.status(200).json({
        status: false,
        connected: false,
        message: "Not connected",
      });
    }

    return res.status(200).json({
      status: true,
      connected: true,
      message: "Connected",
      database: supportCode.database,
      code: supportCode.code,
    });
  } catch (error) {
    console.error("Verify support code error:", error);
    return res.status(500).json({
      status: false,
      connected: false,
      message: "Internal server error",
    });
  }
};
