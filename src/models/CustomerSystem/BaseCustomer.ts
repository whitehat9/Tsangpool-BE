// models/CustomerSystem/BaseCustomer.ts
import mongoose, { Document, Schema } from "mongoose";

export interface IBaseCustomer extends Document {
  _id: string;
  firebaseUid: string;
  phoneNumber: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const baseCustomerSchema = new Schema<IBaseCustomer>(
  {
    firebaseUid: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      match: [/^[6-9]\d{9}$/, "Please enter a valid 10-digit phone number"],
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

baseCustomerSchema.index({ isVerified: 1 });

export const BaseCustomerModel = mongoose.model<IBaseCustomer>(
  "BaseCustomer",
  baseCustomerSchema,
);
