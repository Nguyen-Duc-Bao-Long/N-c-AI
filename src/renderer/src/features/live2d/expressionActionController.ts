import type {
  Live2DExpressionAction
} from './types'


export type ExpressionBlendMode =
  | 'Add'
  | 'Multiply'
  | 'Overwrite'


export type ExpressionParameter = {
  id: string
  value: number
  blend: ExpressionBlendMode
}


export type ExpressionAnalysis = {
  fadeInTime: number
  fadeOutTime: number
  parameters: ExpressionParameter[]
}


export type ExpressionOperation = {
  actionId: string
  parameterId: string
  value: number
  blend: ExpressionBlendMode
}


export type ExpressionFrame = {
  /*
    Operations được giữ đúng thứ tự bật action.

    Nhờ vậy nếu nhiều expression cùng chạm một Parameter,
    ta có quy tắc layer rõ ràng:

      action bật trước -> apply trước
      action bật sau   -> apply sau

    Add / Multiply / Overwrite được thực hiện đúng
    theo Blend ghi trong exp3.json.
  */

  operations: ExpressionOperation[]

  activeActionIds: string[]
}


type RegisteredExpression = {
  action: Live2DExpressionAction
  analysis: ExpressionAnalysis
}


type ActiveExpression = {
  actionId: string
  activationOrder: number
}


export type ExpressionStateListener =
  (activeActionIds: string[]) => void


function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null
  )
}


function finiteNumber(
  value: unknown,
  fallback: number
): number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
      ? value
      : fallback
  )
}


function normalizeBlend(
  value: unknown
): ExpressionBlendMode {
  if (value === 'Multiply') {
    return 'Multiply'
  }

  if (value === 'Overwrite') {
    return 'Overwrite'
  }

  return 'Add'
}


export function analyzeExpression3Json(
  input: unknown
): ExpressionAnalysis {
  if (!isRecord(input)) {
    return {
      fadeInTime: 0,
      fadeOutTime: 0,
      parameters: []
    }
  }

  const rawParameters =
    Array.isArray(input.Parameters)
      ? input.Parameters
      : []

  const parameters:
    ExpressionParameter[] = []

  rawParameters.forEach(
    rawParameter => {
      if (!isRecord(rawParameter)) {
        return
      }

      if (
        typeof rawParameter.Id !== 'string' ||
        rawParameter.Id.length === 0 ||
        typeof rawParameter.Value !== 'number' ||
        !Number.isFinite(rawParameter.Value)
      ) {
        return
      }

      parameters.push({
        id: rawParameter.Id,
        value: rawParameter.Value,
        blend: normalizeBlend(
          rawParameter.Blend
        )
      })
    }
  )

  return {
    fadeInTime: Math.max(
      0,
      finiteNumber(
        input.FadeInTime,
        0
      )
    ),

    fadeOutTime: Math.max(
      0,
      finiteNumber(
        input.FadeOutTime,
        0
      )
    ),

    parameters
  }
}


export class ExpressionActionController {
  private readonly registry =
    new Map<string, RegisteredExpression>()

  private readonly active =
    new Map<string, ActiveExpression>()

  private readonly listeners =
    new Set<ExpressionStateListener>()

  private nextActivationOrder =
    1


  registerExpression(
    action: Live2DExpressionAction,
    analysis: ExpressionAnalysis
  ): void {
    this.active.delete(action.id)

    this.registry.set(
      action.id,
      {
        action,
        analysis
      }
    )
  }


  hasAction(
    actionId: string
  ): boolean {
    return this.registry.has(actionId)
  }


  trigger(
    actionId: string
  ): boolean | null {
    if (!this.registry.has(actionId)) {
      return null
    }

    if (this.active.has(actionId)) {
      this.active.delete(actionId)
      this.emitState()
      return false
    }

    this.active.set(
      actionId,
      {
        actionId,
        activationOrder:
          this.nextActivationOrder++
      }
    )

    this.emitState()
    return true
  }


  stopAction(
    actionId: string
  ): boolean {
    const removed =
      this.active.delete(actionId)

    if (removed) {
      this.emitState()
    }

    return removed
  }


  stopAll(): void {
    if (this.active.size === 0) {
      return
    }

    this.active.clear()
    this.emitState()
  }


  clearModel(): void {
    this.active.clear()
    this.registry.clear()
    this.nextActivationOrder = 1
    this.emitState()
  }


  destroy(): void {
    this.active.clear()
    this.registry.clear()
    this.listeners.clear()
    this.nextActivationOrder = 1
  }


  getActiveActionIds(): string[] {
    return [
      ...this.active.values()
    ]
      .sort(
        (left, right) =>
          left.activationOrder -
          right.activationOrder
      )
      .map(
        state => state.actionId
      )
  }


  getFrame(): ExpressionFrame {
    const operations:
      ExpressionOperation[] = []


    const states = [
      ...this.active.values()
    ].sort(
      (left, right) =>
        left.activationOrder -
        right.activationOrder
    )


    states.forEach(
      state => {
        const registered =
          this.registry.get(
            state.actionId
          )


        if (!registered) {
          return
        }


        registered.analysis
          .parameters
          .forEach(
            parameter => {
              operations.push({
                actionId:
                  state.actionId,

                parameterId:
                  parameter.id,

                value:
                  parameter.value,

                blend:
                  parameter.blend
              })
            }
          )
      }
    )


    return {
      operations,

      activeActionIds:
        this.getActiveActionIds()
    }
  }


  subscribe(
    listener: ExpressionStateListener
  ): () => void {
    this.listeners.add(listener)

    listener(
      this.getActiveActionIds()
    )

    return () => {
      this.listeners.delete(listener)
    }
  }


  private emitState(): void {
    const activeActionIds =
      this.getActiveActionIds()

    this.listeners.forEach(
      listener => {
        try {
          listener(activeActionIds)
        }
        catch (error) {
          console.error(
            '[ExpressionAction] State listener failed:',
            error
          )
        }
      }
    )
  }
}