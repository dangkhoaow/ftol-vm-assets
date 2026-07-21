
export const toRad = deg => deg * (Math.PI / 180);
export const toDeg = rad => rad * (180 / Math.PI);

export const ctxStrokeStyle = (ctx, style) => {
  ctx.strokeStyle = style;
};
export const ctxFillStyle = (ctx, style) => {
  ctx.fillStyle = style;
};
export const ctxBeginPath = (ctx) => {
  ctx.beginPath();
};
export const ctxMoveTo = (ctx, x, y) => {
  ctx.moveTo(x, y);
};
export const ctxLineTo = (ctx, x, y) => {
  ctx.lineTo(x, y);
};
export const ctxArc = (ctx, x, y, radius, startAngle, endAngle, anticlockwise = false) => {
  ctx.arc(x, y, radius, startAngle, endAngle, anticlockwise);
}
export const ctxEllipse = (ctx, x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise = false) => {
  ctx.ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle, anticlockwise);
};
export const ctxFill = (ctx) => {
  ctx.fill();
};
export const ctxStroke = (ctx) => {
  ctx.stroke();
};
export const ctxLineWidth = (ctx, width) => {
  ctx.lineWidth = width;
};
export const ctxRect = (ctx, x, y, width, height) => {
  ctx.rect(x, y, width, height);
};
export const ctxBezierCurveTo = (ctx, cp1x, cp1y, cp2x, cp2y, x, y) => {
  ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x, y);
};
export const ctxRotate = (ctx, angle) => {
  ctx.rotate(angle);
};
export const ctxSave = (ctx) => {
  ctx.save();
};
export const ctxRestore = (ctx) => {
  ctx.restore();
};
export const ctxTranslate = (ctx, x, y) => {
  ctx.translate(x, y);
};
export const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};