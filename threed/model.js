export const SIZE = 19;
export const BLACK = 1;
export const WHITE = 2;
export const SPACING_Z = 1.04;
export const BOARD_SPAN = 18.9;
export const boardSpacing = (size,span=BOARD_SPAN) => span / Math.max(1, size - 1);
export const letters = 'ABCDEFGHJKLMNOPQRST';
export const valid = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const coordinate = (x, y) => `${letters[x]}${SIZE - y}`;
export const worldPoint = (x, y, size=SIZE,span=BOARD_SPAN) => {
  const spacing = boardSpacing(size,span), middle = (size - 1) / 2;
  return { x: (x - middle) * spacing, z: (y - middle) * spacing * SPACING_Z };
};
export function nearestPoint(wx, wz, size=SIZE,span=BOARD_SPAN) {
  const spacing = boardSpacing(size,span), middle = (size - 1) / 2;
  const x = Math.max(0,Math.round(wx / spacing + middle)), y = Math.max(0,Math.round(wz / (spacing * SPACING_Z) + middle));
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= size || y >= size) return null;
  const p = worldPoint(x, y, size,span);
  return Math.hypot(wx - p.x, (wz - p.z) / SPACING_Z) <= spacing * 0.48 ? { x, y } : null;
}

// A placement sandbox, deliberately not a Go rules engine or a game record.
export class Sandbox {
  constructor() { this.board = new Int8Array(SIZE * SIZE); this.turn = BLACK; this.history = []; this.moves = []; }
  save() { this.history.push({ board: this.board.slice(), turn: this.turn, moves: this.moves.slice() }); }
  place(x, y) {
    if (!valid(x, y) || this.board[y * SIZE + x]) return false;
    this.save();
    this.board[y * SIZE + x] = this.turn;
    this.moves.push({ x, y, color: this.turn });
    this.turn = 3 - this.turn;
    return true;
  }
  undo() {
    const previous = this.history.pop();
    if (!previous) return false;
    Object.assign(this, previous);
    return true;
  }
  clear() { if (!this.moves.length) return false; this.save(); this.board.fill(0); this.moves = []; this.turn = BLACK; return true; }
  sample() {
    this.save(); this.board.fill(0); this.moves = []; this.turn = BLACK;
    const points = [[3,3],[15,15],[15,3],[3,15],[16,5],[14,4],[15,5],[14,5],[15,6],[14,6],[16,7],[13,5],[4,14],[4,15],[5,14],[5,15],[6,14],[6,15],[3,13],[2,14],[9,9],[9,15]];
    for (const [x,y] of points) { this.board[y * SIZE + x] = this.turn; this.moves.push({ x, y, color: this.turn }); this.turn = 3 - this.turn; }
  }
}
