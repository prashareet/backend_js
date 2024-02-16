import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import jwt from "jsonwebtoken"
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

    if(!email && !username){
        throw new ApiError(400, "Username or email required")
    }

    const user = await User.findOne({
        $or : [{username}, {email}]
    }
    )

    if(!user){
        throw new ApiError(404, "User does not exist")

    }
    const validPassword = user.isPasswordCorrect(password)

    if(!validPassword){
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
    console.log(req.user._id)
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
const refreshAccessToken = asyncHandler(async (req,res)=>{
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken
    if(!incomingRefreshToken){
        throw new ApiError(401, "Unauthorized access")
    }
    try {
        const decodedRefreshToken = jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
        const user = await User.findById(decodedRefreshToken?._id)
        if(!user){
            throw new ApiError(401, "Invalid refresh token")
        }
        if(incomingRefreshToken!==user?.refreshToken){
            throw new ApiError(400, "Refresh token expired or used")
        }
        const options ={
            httpOnly : true,
            secure : true
        }
        const {accessToken,newRefreshToken}= await generateRefreshAndAccessTokens(user._id)
    
        return res
        .status(200)
        .cookie("accessToken",accessToken,options)
        .cookie("refreshToken",newRefreshToken,options)
        .json(
            new ApiResponse(
                200,
                {accessToken, refreshToken: newRefreshToken},
                "Access Token refreshed"
    
            )
        )
    } catch (error) {
        throw new ApiError(error?.message || "Invalid refresh token")
    }

})

const changeCurrentPassword = asyncHandler(async (req,res)=>{
    const {oldPassword, newPassword} = req.body;

    const user=User.findById(req.user?._id)
    const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isPasswordCorrect){
        throw new ApiError(400, "Invalid password")
    }

    user.password = newPassword
    await user.save({validateBeforeSave : false})

    return res
    .status(200)
    .json(new ApiResponse(200,{}, "Password changed successfully"))
})

const getCurrentUser = asyncHandler(async (req,res)=>{
    return res
    .status(200)
    .json(new ApiResponse(
        200, req.user, "User fetched Successfully"
    ))
})

const updateUserDetails = asyncHandler(async (req,res)=>{
    const {fullname, email} = req.body
    if(!(fullname|| email)){
        throw new ApiError(400, "Invalid fullname or email entered")
    }

    const user=User.findByIdAndUpdate(req.user?._id,
        {
            $set : {
                fullname,
                email
            }
        },
        {
            new: true
        }
        ).select("-password")

        return res
        .status(200)
        .json(new ApiResponse(200, req.user, "User details updated successfully"))
})

const updateUserAvatar = asyncHandler(async (req,res)=>{
    const avatarLocalPath = req.file?.path;
    if(!avatarLocalPath){
        throw new ApiError(400, "Avatar is missing")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new ApiError(400, "Error while uploading new Avatar")
    }

     const user= User.findByIdAndUpdate(req.user?._id,
        {
           $set: { avatar : avatar.url}
        },
        {
            new: true
        }).select("-password")
    return res
    .status(200)
    .json(new ApiResponse(200, {}, "Avatar uploaded successfully"))
})
const updateUserCoverImage = asyncHandler(async (req,res)=>{
    const {coverImageLocalPath} = req.file?.path;
    if(!coverImageLocalPath){
        throw new ApiError(400, "Cover image not found")
    }

    const coverImage = await uploadOnCloudinary(coverImageLocalPath)    

    if(!coverImage.url){
        throw new ApiError(400, "Error while uploading new cover Image")
    }

    const user = User.findByIdAndUpdate(req.user?._id,{
        $set : {
            coverImage : coverImage.url
        }
    },
    {
        new: true
    }).select("-password")

    return res
    .status(200)
    .json(new ApiResponse(200,{},"Cover image updated successfully"))
})

const getUserChannelProfile = asyncHandler(async (req,res)=>{
    const {username} = req.params;
    if(!username?.trim()){
        throw new ApiError(400, "User not found")
    }

    const channel = await User.aggregate([
        {
            $match : {
                username : username?.toLowerCase()
            }
        },
        {
            $lookup : {
                from : "subscriptions",
                localField : "_id",
                foreignField : "channel",
                as : "subscribers"
            }
        },
        {
            $lookup : {
                from : "subscriptions",
                localField : "_id",
                foreignField : "subscriber",
                as : "subscribedTo"
            }
        },
        {
            $addFields : {
                subscribersCount : {
                    $size : "$subscribers"
                },
                channelsSubscribedToCount : {
                    $size : "$subscribedTo"
                }
            }
        },
        {
            isSubscribed : {
                $cond : {
                    if: {$in: [req.user?._id, "$subscribers.subscriber"] },
                    then: true,
                    else : false
                }
            }
        },
        {
            $project : {
                username : 1,
                fullname : 1,
                subscribersCount : 1,
                channelsSubscribedToCount : 1,
                avatar : 1,
                coverImage : 1,
                email : 1,
                isSubscribed : 1
            }
        }
    ])
    if(!channel.length){
        throw new ApiError(404, "Channel does not exist")
    }
    return res
    .status(200)
    .json(new ApiResponse(200, res.channel[0], "Channel fetched successfully"))
})

export { registerUser,loginUser,logoutUser,refreshAccessToken,
    changeCurrentPassword,getCurrentUser
, updateUserDetails, updateUserAvatar,updateUserCoverImage }

