import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import { generateToken } from "../utils/jwt";

export interface IBranchManager extends Document {
  password: string;
  applicationId: string;
  branch: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  matchPassword(enteredPassword: string): Promise<boolean>;
  getSignedJwtToken(): string;
}

const BranchManagerSchema = new Schema<IBranchManager>(
  {
    password: {
      type: String,
      required: [true, "Please add a password"],
      minlength: 6,
      select: false,
    },
    applicationId: {
      type: String,
      required: true,
      unique: true,
    },
    branch: {
      type: Schema.Types.ObjectId,
      ref: "Branch",
      required: [true, "Please add a branch"],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Encrypt password using bcrypt
BranchManagerSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Match user entered password to hashed password in database
BranchManagerSchema.methods.matchPassword = async function (
  enteredPassword: string
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Sign JWT and return
BranchManagerSchema.methods.getSignedJwtToken = function (): string {
  return generateToken({
    id: this._id,
    role: "Branch-Admin",
    branch: this.branch,
  });
};

const BranchManager = mongoose.model<IBranchManager>(
  "BranchManager",
  BranchManagerSchema
);

export default BranchManager;
