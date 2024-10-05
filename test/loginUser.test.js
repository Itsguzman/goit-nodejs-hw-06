import bcrypt from "bcryptjs";
import { jest } from "@jest/globals";
import { User } from "../models/userModel";
import request from "supertest";
import { app } from "../app";
import jwt from "jsonwebtoken";

describe("Test @POST /api/users/login", () => {
  const mockSignin = {
    email: "testuser10@example.com",
    password: "password123",
  };

  const mockUserID = "mockUserID";
  let mockUserAccount;

  beforeAll(async () => {
    const hashedPassword = await bcrypt.hash(mockSignin.password, 10);
    mockUserAccount = {
      _id: mockUserID,
      email: mockSignin.email,
      password: hashedPassword,
      subscription: "starter",
    };

    jest.spyOn(User, "findOne").mockImplementation(({ email }) => {
      if (email === mockSignin.email) {
        return Promise.resolve(mockUserAccount);
      }
      return Promise.resolve(null);
    });

    jest
      .spyOn(bcrypt, "compare")
      .mockImplementation((password, hashedPassword) => {
        return Promise.resolve(
          password === mockSignin.password &&
            hashedPassword === mockUserAccount.password
        );
      });

    jest.spyOn(jwt, "sign").mockImplementation(() => "mockJwtToken");

    jest
      .spyOn(User, "findByIdAndUpdate")
      .mockImplementation((id, updateFields) => {
        if (id === mockUserID) {
          return Promise.resolve({
            ...mockUserAccount,
            ...updateFields,
          });
        }
        return Promise.resolve(null);
      });
  });

  test("Login POST request with correct data", async () => {
    const response = await request(app)
      .post("/api/users/login")
      .send(mockSignin);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token", "mockJwtToken");

    const { user } = response.body;
    expect(user).toHaveProperty("email");
    expect(user).toHaveProperty("subscription");
    expect(user.email).toBe(mockSignin.email);
    expect(user.subscription).toBe("starter");
  });
});
