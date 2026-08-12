export type Live2DExpressionAction = {
  id: string

  type: 'expression'

  label: string

  name: string
}


export type Live2DMotionAction = {
  id: string

  type: 'motion'

  label: string

  group: string

  index: number
}


export type Live2DAction =
  | Live2DExpressionAction
  | Live2DMotionAction