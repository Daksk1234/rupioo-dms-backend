import { Chat } from "../model/chat.model.js";

export const saveChat = async (req, res, next) => {
    try {
        const { superadmin, messages } = req.body;
        const messagesToAdd =messages.length>0 ? messages : [messages];
        const existingChat = await Chat.findOne({ superadmin });
        if (existingChat) {
            existingChat.messages.push(...messagesToAdd);
            await existingChat.save();
            return res.status(200).json({ message: "Chat Saved", status: true });
        } else {
            const chat = await Chat.create(req.body);
            return chat
                ? res.status(200).json({ message: "Chat Saved", status: true })
                : res.status(404).json({ message: "Something Went Wrong", status: false });
        }
    } catch (error) {
        console.error("Error saving chat:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message, status: false });
    }
};


export const viewChat=async(req,res,next)=>{
    try {
        const {superadmin}=req.params;
        const chat=await Chat.find({superadmin:superadmin});
        return chat.length>0?res.status(200).json({message:"Data Found",chat,status:true}):res.status(404).json({message:"Data Not Found",status:false})
    } catch (error) {
        console.log(error);
        res.status(500).json({ message: "Internal Server Error",error:error.message,status:false });  
    }
}