// File: controller/_hrmCommon.js
import fs from "fs";
import path from "path";
import mongoose from "mongoose";

export const success = (res, message, data = null, extra = {}) => res.status(200).json({ status: true, message, data, ...extra });
export const fail = (res, code, message, error = null) => res.status(code).json({ status: false, message, error: error ? String(error?.message || error) : undefined });
export const cleanDatabase = (value) => { const db=String(value||"").trim(); if(!db) throw new Error("Database is required."); if(!/^[a-zA-Z0-9_-]+$/.test(db)) throw new Error("Invalid database name."); return db; };
export const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value||""));
export const toObjectId = (value) => isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
export const parseArrayNumber = (value) => { if(!value) return []; let arr=value; if(typeof value==='string'){try{arr=JSON.parse(value)}catch{return []}} return Array.isArray(arr)?arr.map(Number).filter(Number.isFinite):[]; };
export const parseJsonArray = (value, fallback=[]) => { if(Array.isArray(value)) return value; if(typeof value==='string'){try{const v=JSON.parse(value); return Array.isArray(v)?v:fallback;}catch{return fallback}} return fallback; };
export const normalizeBase64 = (input) => { if(!input) return ""; const s=String(input); return s.includes('base64,') ? s.split('base64,')[1] : s; };
export const getExtensionFromMime = (mime) => { const m=String(mime||'').toLowerCase(); if(m.includes('png')) return 'png'; if(m.includes('webp')) return 'webp'; return 'jpg'; };
export const getImagesDir = () => path.join(process.cwd(), 'public', 'Images');
export const photoUrlFromFile = (file) => file?.filename ? `/Images/${file.filename}` : "";
export const fileNameFromUrl = (url) => url ? String(url).split('/').pop() : "";
export const deleteOldImage = async (url) => { const f=fileNameFromUrl(url); if(!f) return; await fs.promises.unlink(path.join(getImagesDir(), f)).catch(()=>{}); };
export const saveBase64Image = async ({ photoBase64, imageMimeType }) => { const b=normalizeBase64(photoBase64); if(!b) return { photoUrl:"", photoFileName:"" }; await fs.promises.mkdir(getImagesDir(), {recursive:true}); const ext=getExtensionFromMime(imageMimeType); const fileName=`faceImage-${Date.now()}-${Math.round(Math.random()*1e9)}.${ext}`; await fs.promises.writeFile(path.join(getImagesDir(), fileName), Buffer.from(b,'base64')); return { photoUrl:`/Images/${fileName}`, photoFileName:fileName}; };
export const uploadedImageData = async (req, oldUrl="") => { if(req.file?.filename){ if(oldUrl) await deleteOldImage(oldUrl); return { photoUrl: photoUrlFromFile(req.file), photoFileName:req.file.filename }; } if(req.body?.photoBase64){ if(oldUrl) await deleteOldImage(oldUrl); return saveBase64Image({ photoBase64:req.body.photoBase64, imageMimeType:req.body.imageMimeType||'image/jpeg' }); } return { photoUrl:"", photoFileName:""}; };
export const todayKey = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
