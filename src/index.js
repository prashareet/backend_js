import connectDB from "./db/connection.js";
import dotenv from "dotenv"

dotenv.config({
    path : './env'
})

connectDB()
.then(()=>{
    app.listen(process.env.PORT || 8000 , ()=>{
        console.log(`Server running at port : ${process.env.PORT}`);
    })
})
.catch((err)=>{
    console.log("MongoDB connection failed",err)
})