import bcrypt from "bcrypt";

export function verifyToken(request, reply, done) {
  const hashPassword = request.headers["authorization"];
  if (!hashPassword) {
    reply.status(401).send({ success: false, code: 1001 });
  } else {
    const password = process.env.NANA_PASSWORD;
    bcrypt.compare(password, hashPassword, (err, result) => {
      if (err) {
        reply.status(401).send({ success: false, error: 1003 });
      } else if (result) {
        done();
      } else {
        reply.status(401).send({ success: false, code: 1002 });
      }
    });
  }
}
