/**
 * Type definitions for Flashback cutscene data.
 */

export interface Color {
  r: number
  g: number
  b: number
}

export interface PointPrimitive {
  type: 'point'
  color: number
  hasAlpha: boolean
  offsetX?: number
  offsetY?: number
  x: number
  y: number
}

export interface EllipsePrimitive {
  type: 'ellipse'
  color: number
  hasAlpha: boolean
  offsetX?: number
  offsetY?: number
  cx: number
  cy: number
  rx: number
  ry: number
}

export interface PolygonPrimitive {
  type: 'polygon'
  color: number
  hasAlpha: boolean
  offsetX?: number
  offsetY?: number
  vertices: [number, number][]
}

export type Primitive = PointPrimitive | EllipsePrimitive | PolygonPrimitive

export interface Shape {
  id: number
  primitives: Primitive[]
}

export interface Command {
  op: string
  shapeId?: number
  x?: number
  y?: number
  zoom?: number
  originX?: number
  originY?: number
  rotationA?: number
  rotationB?: number
  rotationC?: number
  paletteNum?: number
  bufferNum?: number
  clearMode?: number
  frames?: number
  stringId?: number
  color?: number
  handlers?: { keyMask: number; target: number }[]
  skipped?: number[]
}

export interface Frame {
  commands: Command[]
}

export interface Subscene {
  id: number
  offset: number
  frames: Frame[]
}

export interface Script {
  subsceneCount: number
  baseOffset: number
  subscenes: Subscene[]
}

export interface Cutscene {
  name: string
  shapes: Shape[]
  palettes: Color[][]
  script: Script
}

/** Original Flashback screen dimensions */
export const SCREEN_WIDTH = 256
export const SCREEN_HEIGHT = 224

/** Cutscene viewport within the screen */
export const VIEWPORT_WIDTH = 240
export const VIEWPORT_HEIGHT = 128
export const VIEWPORT_X = (SCREEN_WIDTH - VIEWPORT_WIDTH) / 2  // 8
export const VIEWPORT_Y = 50
