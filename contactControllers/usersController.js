import { User } from "../models/userModel.js";
import { signupValidation, subscriptionValidation } from "../validation.js";
import "dotenv/config";
import path from "path";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import gravatar from "gravatar";
import { Jimp } from "jimp";
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { sendEmail } from "../helpers/sendEmail.js";
import { nanoid } from "nanoid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { SECRET_KEY, PORT } = process.env;

const signupUser = async (req, res) => {
  const { error } = signupValidation.validate(req.body);

  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }
  try {
    const { email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already in use" });
    }

    const avatarURL = gravatar.url(email, { protocol: "http" });
    const hashPass = await bcrypt.hash(password, 10);
    const verificationToken = nanoid();

    const newUser = await User.create({
      email,
      password: hashPass,
      avatarURL,
      verificationToken,
    });

    const verificationLink = `https://localhost:${PORT}/api/users/verify/${verificationToken}`;
    await sendEmail({
      to: email,
      subject: "Verify your email address",
      html: `<p>Thank you for registering!</p>
             <p>Please click the link below to verify your email:</p>
             <a href="${verificationLink}">Verify Email</a>`,
    });

    res.status(201).json({
      message: "User created. Please verify your email.",
      user: {
        email: newUser.email,
        avatarURL: newUser.avatarURL,
        verificationToken,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const loginUser = async (req, res) => {
  const { error } = signupValidation.validate(req.body);

  if (error) {
    res.status(400).json({ message: "Invalid input" });
  }
  try {
    const { email, password } = req.body;

    const verifyUser = await User.findOne({ email });

    if (!verifyUser) {
      return res.status(401).json({ message: "Wrong email" });
    }

    const PasswordValid = await bcrypt.compare(password, verifyUser.password);

    if (!PasswordValid) {
      return res.status(401).json({ message: "Wrong Password" });
    }

    const payload = { id: verifyUser._id };
    const token = jwt.sign(payload, SECRET_KEY, { expiresIn: "23h" });
    await User.findByIdAndUpdate(verifyUser._id, { token: token });
    res.status(200).json({
      token: token,
      user: {
        email: verifyUser.email,
        subscription: verifyUser.subscription,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateUserSubscription = async (req, res) => {
  try {
    const { error } = subscriptionValidation.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const { _id } = req.user;
    const updateUser = await User.findByIdAndUpdate(_id, req.body, {
      new: true,
    });

    res.json({
      email: updateUser.email,
      subscription: updateUser.subscription,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
const logoutUser = async (req, res) => {
  try {
    const { _id } = req.user;
    await User.findByIdAndUpdate(_id, { token: "" });
    res.status(204).send("logout user");
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const { email, subscription } = req.user;
    res.jhson({
      email,
      subscription,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateAvatar = async (req, res) => {
  try {
    const { _id } = req.user;

    if (!req.file) {
      console.error("No file uploaded");
      return res.status(400).json({ message: "No file uploaded" });
    }

    const tmpPath = req.file.path;
    const originalName = req.file.originalname;

    await Jimp.read(tmpPath)
      .then((image) => image.resize(250, 250).write(tmpPath))
      .catch((error) => console.error(error));

    const extension = path.extname(originalName);
    const filename = `${_id}${extension}`;

    const avatarDir = path.join(__dirname, "../public/avatars");
    const avatarPath = path.join(avatarDir, filename);

    await fs.rename(tmpPath, avatarPath);

    const avatarURL = path.join("/avatars", filename);
    const updatedUser = await User.findByIdAndUpdate(
      _id,
      { avatarURL },
      { new: true }
    );

    res.status(200).json({ avatarURL });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const verifyEmail = async (req, res) => {
  const { verificationToken } = req.params;

  try {
    const user = await User.findOne({ verificationToken });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndUpdate(user._id, {
      verify: true,
      verificationToken: null,
    });
    res.status(200).json({
      message: "Successful verification",
    });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

const resendVerifyEmail = async (req, res) => {
  const { email } = req.body;

  const { error } = emailValidation.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.message });
  }
  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res
        .status(404)
        .json({ message: "The provided email address could not be found" });
    }

    if (user.verify) {
      return res
        .status(400)
        .json({ message: "Verification has already been passed" });
    }
    await sendEmail({
      to: email,
      subject: "Action Required: Verify Your Email",
      html: '<a target="_blank" href="http://localhost:${PORT}/api/users/verify/${user.verificationToken}">Click to verify email</a>',
    });

    res.json({ message: "Verification email sent" });
  } catch (error) {
    res.status(500).json({ message: "Internal server error" });
  }
};

export {
  signupUser,
  loginUser,
  logoutUser,
  getCurrentUser,
  updateUserSubscription,
  updateAvatar,
  verifyEmail,
  resendVerifyEmail,
};
