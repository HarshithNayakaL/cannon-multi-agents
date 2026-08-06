/**
 * The static backdrop every surface sits on: one cool wash from the top and a
 * grid that fades out within the first screenful. Decorative, so it is hidden
 * from assistive tech; static, because a chat surface that is always moving
 * behind the text is a distraction rather than a flourish.
 */
export function CanvasField() {
  return <div className="canvas" aria-hidden="true" />;
}
