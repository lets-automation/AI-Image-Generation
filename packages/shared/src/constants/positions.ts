export const Position = {
  TOP_LEFT: "TOP_LEFT",
  TOP_CENTER: "TOP_CENTER",
  TOP_RIGHT: "TOP_RIGHT",
  MIDDLE_LEFT: "MIDDLE_LEFT",
  MIDDLE_CENTER: "MIDDLE_CENTER",
  MIDDLE_RIGHT: "MIDDLE_RIGHT",
  BOTTOM_LEFT: "BOTTOM_LEFT",
  BOTTOM_CENTER: "BOTTOM_CENTER",
  BOTTOM_RIGHT: "BOTTOM_RIGHT",
} as const;

export type Position = (typeof Position)[keyof typeof Position];

export interface PositionLabel {
  code: Position;
  label: string;
  row: number; // 0=Top, 1=Middle, 2=Bottom
  col: number; // 0=Left, 1=Center, 2=Right
}

export const POSITION_LABELS: Record<Position, PositionLabel> = {
  TOP_LEFT: { code: "TOP_LEFT", label: "Top Left", row: 0, col: 0 },
  TOP_CENTER: { code: "TOP_CENTER", label: "Top Center", row: 0, col: 1 },
  TOP_RIGHT: { code: "TOP_RIGHT", label: "Top Right", row: 0, col: 2 },
  MIDDLE_LEFT: { code: "MIDDLE_LEFT", label: "Middle Left", row: 1, col: 0 },
  MIDDLE_CENTER: { code: "MIDDLE_CENTER", label: "Middle Center", row: 1, col: 1 },
  MIDDLE_RIGHT: { code: "MIDDLE_RIGHT", label: "Middle Right", row: 1, col: 2 },
  BOTTOM_LEFT: { code: "BOTTOM_LEFT", label: "Bottom Left", row: 2, col: 0 },
  BOTTOM_CENTER: { code: "BOTTOM_CENTER", label: "Bottom Center", row: 2, col: 1 },
  BOTTOM_RIGHT: { code: "BOTTOM_RIGHT", label: "Bottom Right", row: 2, col: 2 },
};

export const ALL_POSITIONS = Object.values(Position);

export const GRID_ROWS = 3;
export const GRID_COLS = 3;
