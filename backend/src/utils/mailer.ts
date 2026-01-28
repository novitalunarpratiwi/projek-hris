import nodemailer from "nodemailer";

export const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

mailer.verify((error) => {
  if (error) console.log("Mailer Error:", error);
  else console.log("Mailer Ready ✔");
});
