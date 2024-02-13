import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const generateRefreshAndAccessTokens = async(userid) =>{
    const user = await User.findById(userid)
    const refreshToken = user.generateRefreshToken()
    const accessToken = user.generateAccessToken()

    user.refreshToken = refreshToken;
    await user.save({validateBeforeSave: false})
    return {
        refreshToken,
        accessToken
    }
}

const registerUser = asyncHandler(async (req,res)=>{
    // get user details from the frontend
    // validation - check if empty
    // check if user already exists by username and email whether they are unique or not
    // check for images, avatar,
    // upload them to cloudinary, check for avatar,
    // create a user object - create an entry in database,
    // remove password and refresh token field from response,
    // check for creation
    // return response

    const {fullname, username,email,password} = req.body
    console.log("email: ", email)

    if(
        [fullname,username,email,password].some((field)=>
        field?.trim()==="")
    )
    {
        throw new ApiError(400, "All fields are required")
    }

    const existedUser=await User.findOne({
        $or : [{username}, {email}]
    })

    if(existedUser){
        throw new ApiError(409, "User with such username or email already exists")

    }

    const avatarLocalPath = req.files?.avatar[0]?.path;
    // const coverImageLocalPath = req.files?.coverImage[0]?.path;
    console.log(req.files);
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }
   
    const user= await User.create({
        fullname,
        username,
        avatar : avatar.url,
        email,
        password,
        coverImage: coverImage?.url || "",
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if(!createdUser){
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successfully")
    )

})

const loginUser = asyncHandler(async (req,res)=>{
    // req.body - username/email and password
    // check if correct
    // check if user exists
    // check password
    // generate refresh and access token
    // send cookie
    // send response

    const {username, email , password} = req.body

    if(!email || !username){
        throw new ApiError(400, "Username or email required")
    }

    const user = await User.findOne({
        $or : [{username}, {email}]
    }
    )

    if(!user){
        throw new ApiError(404, "User does not exist")

    }
    const isPasswordValid = user.isPasswordValid(password)

    if(!isPasswordValid){
        throw new ApiError(401, "Password is Invalid");
    }

    const {refreshToken,accessToken}=await generateRefreshAndAccessTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    const options = {
        httpOnly : true,
        secure : true
    }

    return res.status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken",refreshToken,options)
    .json(
        new ApiResponse(200,{
            user : loggedInUser,accessToken,refreshToken
        },"User logged in Successfully")
    )
})

const logoutUser = asyncHandler(async (req,res)=>{
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set : {
                refreshToken: undefined
            }
        },
        {
            new : true
        }

    )
    const options = {
        httpOnly : true,
        secure : true
    }
    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, "User logged out successfully"));
})

export { registerUser,loginUser,logoutUser }

