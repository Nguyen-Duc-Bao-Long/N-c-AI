import {
  evaluateMotionAnalysis,
  isPersistentMotionCurve
} from './actionClassifier'

import type {
  MotionAnalysis
} from './actionClassifier'

import type {
  Live2DActionMode,
  Live2DMotionAction
} from './types'


/*
  ============================================================
  MULTI ACTION CONTROLLER
  ============================================================

  Mục tiêu:

  1. Nhiều motion ngắn có thể cùng tồn tại.

  2. Motion dạng toggle:
       click lần 1 -> ON
       click lần 2 -> OFF

  3. Toggle không loop:
       chạy tới frame cuối
       rồi giữ frame cuối.

  4. Toggle có loop:
       loop liên tục tới khi OFF.

  5. Nếu nhiều action cùng điều khiển
     cùng một Parameter / PartOpacity:

       action được kích hoạt sau cùng
       sẽ thắng CHỈ trên curve bị trùng.

     Các curve không trùng vẫn chạy
     song song bình thường.

  File này KHÔNG trực tiếp ghi giá trị
  vào Cubism model.

  Nó chỉ:
    - quản lý state
    - tính thời gian
    - evaluate curve
    - resolve conflict
    - trả ra frame cuối cùng

  Live2DStage.vue sẽ nối controller này
  với Cubism model ở bước tiếp theo.
*/


/*
  ============================================================
  TYPES
  ============================================================
*/


export type MultiActionConflictPolicy =
  'latest-wins'


export type RegisteredMotionAction = {
  action:
    Live2DMotionAction

  analysis:
    MotionAnalysis
}


export type ActiveMotionState = {
  actionId:
    string

  mode:
    Live2DActionMode

  /*
    performance.now() / timestamp
    tính bằng millisecond.
  */

  startedAtMs:
    number

  /*
    Thứ tự kích hoạt.

    Số lớn hơn = kích hoạt sau hơn.

    Dùng để resolve conflict.
  */

  activationOrder:
    number
}


export type MultiActionStateSnapshot = {
  activeToggleActionIds:
    string[]

  activeOneshotActionIds:
    string[]
}


export type MultiActionTriggerResult = {
  actionId:
    string

  mode:
    Live2DActionMode

  /*
    Với toggle:
      true  = vừa ON
      false = vừa OFF

    Với oneshot:
      true = đã bắt đầu / restart
  */

  active:
    boolean

  state:
    MultiActionStateSnapshot
}


export type MultiActionFrame = {
  /*
    Parameter cuối cùng sau khi
    resolve tất cả action.
  */

  parameters:
    Record<
      string,
      number
    >

  /*
    PartOpacity cuối cùng.
  */

  partOpacities:
    Record<
      string,
      number
    >

  /*
    Target = Model.

    Bước kế tiếp có thể xử lý riêng:
      - Opacity
      - EyeBlink
      - LipSync
      - các Model curve khác
  */

  modelCurves:
    Record<
      string,
      number
    >

  /*
    Debug:
    action nào đang sở hữu giá trị
    cuối cùng của curve đó.
  */

  parameterOwners:
    Record<
      string,
      string
    >

  partOpacityOwners:
    Record<
      string,
      string
    >

  modelCurveOwners:
    Record<
      string,
      string
    >

  activeToggleActionIds:
    string[]

  activeOneshotActionIds:
    string[]
}


export type MultiActionStateListener =
  (
    state:
      MultiActionStateSnapshot
  ) => void


/*
  ============================================================
  CONSTANTS
  ============================================================
*/


const UNKNOWN_ONESHOT_DURATION_SECONDS =
  0.10


/*
  Hiện tại conflict policy duy nhất:

    latest-wins

  Ví dụ:

    ArmUp:
      ParamArmL

    Wave:
      ParamArmL

  ArmUp đang ON.
  Sau đó click Wave.

  Trong lúc Wave chạy:
    ParamArmL -> Wave thắng

  Khi Wave kết thúc:
    ArmUp tiếp tục giữ ParamArmL

  Nhưng nếu:

    Hat:
      ParamHat

    Tail:
      ParamTail

  thì cả hai không conflict
  và chạy đồng thời.
*/


const DEFAULT_CONFLICT_POLICY:
  MultiActionConflictPolicy =
    'latest-wins'


/*
  ============================================================
  TIME
  ============================================================
*/


function getNowMs():
  number {
  if (
    typeof performance !==
      'undefined' &&
    typeof performance.now ===
      'function'
  ) {
    return performance.now()
  }


  return Date.now()
}


/*
  ============================================================
  DURATION
  ============================================================
*/


function getAnalysisDuration(
  analysis:
    MotionAnalysis
): number {
  if (
    analysis.duration !==
      null &&
    Number.isFinite(
      analysis.duration
    ) &&
    analysis.duration >
      0
  ) {
    return analysis.duration
  }


  /*
    Nếu Meta.Duration thiếu,
    lấy endTime lớn nhất của curves.
  */

  let maxCurveTime =
    0


  analysis.curves.forEach(
    curve => {
      if (
        curve.endTime !==
          null &&
        Number.isFinite(
          curve.endTime
        )
      ) {
        maxCurveTime =
          Math.max(
            maxCurveTime,
            curve.endTime
          )
      }
    }
  )


  if (
    maxCurveTime >
    0
  ) {
    return maxCurveTime
  }


  return UNKNOWN_ONESHOT_DURATION_SECONDS
}


/*
  ============================================================
  MODE
  ============================================================
*/


function resolveDefaultMode(
  registered:
    RegisteredMotionAction
): Live2DActionMode {
  return (
    registered.action
      .metadata
      ?.mode ??

    registered.analysis
      .metadata
      .mode ??

    registered.analysis
      .metadata
      .suggestedMode ??

    'oneshot'
  )
}


/*
  ============================================================
  CURVE OWNERSHIP KEY
  ============================================================

  Parameter:ParamArmL
  PartOpacity:PartHat

  Dùng để lọc các curve thực sự thuộc trạng thái
  của toggle action.
*/


function curveOwnershipKey(
  target: string,
  id: string
): string {
  return `${target}:${id}`
}


/*
  ============================================================
  PERSISTENT CURVE SET
  ============================================================

  Motion toggle không-loop chỉ được phép giữ các curve
  thực sự kết thúc ở trạng thái khác ban đầu.

  Đây là điểm sửa lỗi quan trọng:

    RaiseLeftArm
      có ParamArmL 0 -> 1
      nhưng có thể cũng chứa ParamArmR 0 -> 0

    RaiseRightArm
      có ParamArmR 0 -> 1
      nhưng có thể cũng chứa ParamArmL 0 -> 0

  Nếu apply cả 0 -> 0, action thứ hai sẽ reset action trước.

  Sau thay đổi:

    RaiseLeftArm chỉ "sở hữu" ParamArmL
    RaiseRightArm chỉ "sở hữu" ParamArmR

  nên hai tay có thể cùng giơ.
*/


function getPersistentCurveKeySet(
  analysis: MotionAnalysis
): Set<string> {
  return new Set(
    analysis.curves
      .filter(
        isPersistentMotionCurve
      )
      .map(
        curve =>
          curveOwnershipKey(
            curve.target,
            curve.id
          )
      )
  )
}


/*
  ============================================================
  CONTROLLER
  ============================================================
*/


export class MultiActionController {
  /*
    ==========================================================
    REGISTRY
    ==========================================================

    actionId
      ->
    action + parsed motion curves
  */

  private readonly registry =
    new Map<
      string,
      RegisteredMotionAction
    >()


  /*
    Optional override.

    Sau này UI có thể cho user chọn:

      One-shot
      Toggle

    mà không cần sửa file model.
  */

  private readonly modeOverrides =
    new Map<
      string,
      Live2DActionMode
    >()


  /*
    ==========================================================
    ACTIVE ACTIONS
    ==========================================================
  */

  private readonly activeToggles =
    new Map<
      string,
      ActiveMotionState
    >()


  private readonly activeOneshots =
    new Map<
      string,
      ActiveMotionState
    >()


  /*
    Global increasing number.

    Dùng thay timestamp khi resolve
    hai action được click gần như
    cùng thời điểm.
  */

  private nextActivationOrder =
    1


  /*
    ==========================================================
    LISTENERS
    ==========================================================
  */

  private readonly listeners =
    new Set<
      MultiActionStateListener
    >()


  /*
    ==========================================================
    OPTIONS
    ==========================================================
  */

  readonly conflictPolicy:
    MultiActionConflictPolicy


  constructor(
    conflictPolicy:
      MultiActionConflictPolicy =
        DEFAULT_CONFLICT_POLICY
  ) {
    this.conflictPolicy =
      conflictPolicy
  }


  /*
    ==========================================================
    REGISTER
    ==========================================================
  */


  registerMotion(
    action:
      Live2DMotionAction,
    analysis:
      MotionAnalysis
  ): void {
    /*
      Nếu model reload nhưng vô tình
      dùng lại actionId cũ,
      không được giữ active state cũ.
    */

    this.stopAction(
      action.id,
      false
    )


    this.registry.set(
      action.id,
      {
        action,

        analysis
      }
    )
  }


  registerMany(
    motions:
      RegisteredMotionAction[]
  ): void {
    motions.forEach(
      motion => {
        this.registerMotion(
          motion.action,
          motion.analysis
        )
      }
    )


    this.emitState()
  }


  hasAction(
    actionId:
      string
  ): boolean {
    return this.registry.has(
      actionId
    )
  }


  getRegisteredAction(
    actionId:
      string
  ):
    RegisteredMotionAction |
    null {
    return (
      this.registry.get(
        actionId
      ) ??
      null
    )
  }


  /*
    ==========================================================
    MODE OVERRIDE
    ==========================================================
  */


  getActionMode(
    actionId:
      string
  ):
    Live2DActionMode |
    null {
    const registered =
      this.registry.get(
        actionId
      )


    if (
      !registered
    ) {
      return null
    }


    return (
      this.modeOverrides.get(
        actionId
      ) ??
      resolveDefaultMode(
        registered
      )
    )
  }


  setModeOverride(
    actionId:
      string,
    mode:
      Live2DActionMode |
      null
  ): void {
    if (
      !this.registry.has(
        actionId
      )
    ) {
      return
    }


    /*
      Đổi mode trong lúc action đang chạy
      dễ tạo state mâu thuẫn.

      Stop action trước.
    */

    this.stopAction(
      actionId,
      false
    )


    if (
      mode ===
      null
    ) {
      this.modeOverrides.delete(
        actionId
      )
    }
    else {
      this.modeOverrides.set(
        actionId,
        mode
      )
    }


    this.emitState()
  }


  clearModeOverrides():
    void {
    this.modeOverrides.clear()
  }


  /*
    ==========================================================
    TRIGGER
    ==========================================================

    Hàm chính mà Live2DStage.vue
    sẽ gọi ở bước tiếp theo.

    oneshot:
      click -> start/restart

    toggle:
      OFF -> ON
      ON  -> OFF
  */


  trigger(
    actionId:
      string,
    nowMs:
      number =
        getNowMs()
  ):
    MultiActionTriggerResult |
    null {
    const registered =
      this.registry.get(
        actionId
      )


    if (
      !registered
    ) {
      console.warn(
        `[MultiAction] Unknown action: ${actionId}`
      )


      return null
    }


    const mode =
      this.getActionMode(
        actionId
      ) ??
      'oneshot'


    /*
      ========================================================
      TOGGLE
      ========================================================
    */

    if (
      mode ===
      'toggle'
    ) {
      if (
        this.activeToggles.has(
          actionId
        )
      ) {
        this.activeToggles.delete(
          actionId
        )


        this.activeOneshots.delete(
          actionId
        )


        const state =
          this.getState()


        this.emitState(
          state
        )


        return {
          actionId,

          mode,

          active:
            false,

          state
        }
      }


      this.activeOneshots.delete(
        actionId
      )


      this.activeToggles.set(
        actionId,
        {
          actionId,

          mode,

          startedAtMs:
            nowMs,

          activationOrder:
            this.takeActivationOrder()
        }
      )


      const state =
        this.getState()


      this.emitState(
        state
      )


      return {
        actionId,

        mode,

        active:
          true,

        state
      }
    }


    /*
      ========================================================
      ONESHOT
      ========================================================

      Nếu đang chạy action đó rồi,
      click lại sẽ restart từ đầu.
    */

    this.activeToggles.delete(
      actionId
    )


    this.activeOneshots.set(
      actionId,
      {
        actionId,

        mode:

          'oneshot',

        startedAtMs:
          nowMs,

        activationOrder:
          this.takeActivationOrder()
      }
    )


    const state =
      this.getState()


    this.emitState(
      state
    )


    return {
      actionId,

      mode:
        'oneshot',

      active:
        true,

      state
    }
  }


  /*
    ==========================================================
    STOP
    ==========================================================
  */


  stopAction(
    actionId:
      string,
    notify =
      true
  ): boolean {
    const removedToggle =
      this.activeToggles.delete(
        actionId
      )


    const removedOneshot =
      this.activeOneshots.delete(
        actionId
      )


    const removed =
      removedToggle ||
      removedOneshot


    if (
      removed &&
      notify
    ) {
      this.emitState()
    }


    return removed
  }


  stopAll():
    void {
    const hadActiveActions =
      this.activeToggles.size >
        0 ||
      this.activeOneshots.size >
        0


    this.activeToggles.clear()
    this.activeOneshots.clear()


    if (
      hadActiveActions
    ) {
      this.emitState()
    }
  }


  /*
    ==========================================================
    STATE
    ==========================================================
  */


  isToggleActive(
    actionId:
      string
  ): boolean {
    return this.activeToggles.has(
      actionId
    )
  }


  isOneshotActive(
    actionId:
      string
  ): boolean {
    return this.activeOneshots.has(
      actionId
    )
  }


  getState():
    MultiActionStateSnapshot {
    return {
      activeToggleActionIds:
        this.getSortedActiveStates(
          this.activeToggles
        )
          .map(
            state =>
              state.actionId
          ),

      activeOneshotActionIds:
        this.getSortedActiveStates(
          this.activeOneshots
        )
          .map(
            state =>
              state.actionId
          )
    }
  }


  /*
    ==========================================================
    SUBSCRIBE
    ==========================================================

    Bước sau App.vue / ReactionWheel.vue
    sẽ dùng để highlight action đang ON.
  */


  subscribe(
    listener:
      MultiActionStateListener
  ):
    () => void {
    this.listeners.add(
      listener
    )


    /*
      Gửi state hiện tại ngay lập tức.
    */

    listener(
      this.getState()
    )


    return () => {
      this.listeners.delete(
        listener
      )
    }
  }


  /*
    ==========================================================
    UPDATE
    ==========================================================

    Gọi mỗi frame.

    Nhiệm vụ chính:
      xóa oneshot đã chạy hết.
  */


  update(
    nowMs:
      number =
        getNowMs()
  ): void {
    const removed =
      this.removeFinishedOneshots(
        nowMs
      )


    if (
      removed
    ) {
      this.emitState()
    }
  }


  /*
    ==========================================================
    BUILD FRAME
    ==========================================================

    Đây là phần quan trọng nhất.

    Tất cả active actions đều được
    evaluate độc lập.

    Sau đó merge theo activationOrder.

    Với toggle không-loop:
      trước tiên bỏ các curve neutral/default
      không tạo ra state mới.

    Sau đó latest-wins:
      action click sau chỉ ghi đè
      curve persistent thực sự bị conflict.

    Nhờ vậy:
      RaiseLeft + RaiseRight
      TailUp + RaiseArm
      Hat + Tail
    có thể cùng tồn tại nếu chúng thay đổi
    các state khác nhau.
  */


  getFrame(
    nowMs:
      number =
        getNowMs()
  ): MultiActionFrame {
    this.update(
      nowMs
    )


    const parameters:
      Record<
        string,
        number
      > =
        {}


    const partOpacities:
      Record<
        string,
        number
      > =
        {}


    const modelCurves:
      Record<
        string,
        number
      > =
        {}


    const parameterOwners:
      Record<
        string,
        string
      > =
        {}


    const partOpacityOwners:
      Record<
        string,
        string
      > =
        {}


    const modelCurveOwners:
      Record<
        string,
        string
      > =
        {}


    /*
      Gộp cả toggle + oneshot,
      rồi sort từ cũ -> mới.

      Action mới sẽ apply sau,
      do đó latest-wins.
    */

    const activeStates =
      [
        ...this.activeToggles
          .values(),

        ...this.activeOneshots
          .values()
      ]
        .sort(
          (
            left,
            right
          ) =>
            left.activationOrder -
            right.activationOrder
        )


    activeStates.forEach(
      activeState => {
        const registered =
          this.registry.get(
            activeState.actionId
          )


        if (
          !registered
        ) {
          return
        }


        const elapsedSeconds =
          Math.max(
            0,
            (
              nowMs -
              activeState.startedAtMs
            ) /
            1000
          )


        /*
          ONESHOT phải chạy đúng một vòng.

          Nếu JSON của motion ghi Loop=true
          nhưng user override thành oneshot,
          controller vẫn không được loop vô hạn.
        */

        const evaluationAnalysis:
          MotionAnalysis =
            activeState.mode ===
              'oneshot' &&
            registered.analysis.loop
              ? {
                  ...registered.analysis,

                  loop:
                    false
                }
              : registered.analysis


        const evaluatedCurves =
          evaluateMotionAnalysis(
            evaluationAnalysis,
            elapsedSeconds
          )


        /*
          ====================================================
          TOGGLE CURVE ISOLATION
          ====================================================

          Non-loop toggle:
            chỉ apply các curve kết thúc ở state mới.

          Loop toggle:
            apply toàn bộ curve vì animation cần chạy vòng.

          Oneshot:
            apply toàn bộ curve trong thời gian motion chạy.
        */

        const persistentCurveKeys =
          activeState.mode ===
            'toggle' &&
          !registered.analysis.loop
            ? getPersistentCurveKeySet(
                registered.analysis
              )
            : null


        evaluatedCurves.forEach(
          curve => {
            if (
              persistentCurveKeys &&
              !persistentCurveKeys.has(
                curveOwnershipKey(
                  curve.target,
                  curve.id
                )
              )
            ) {
              return
            }


            /*
              ----------------------------
              PARAMETER
              ----------------------------
            */

            if (
              curve.target ===
              'Parameter'
            ) {
              parameters[
                curve.id
              ] =
                curve.value


              parameterOwners[
                curve.id
              ] =
                activeState.actionId


              return
            }


            /*
              ----------------------------
              PART OPACITY
              ----------------------------
            */

            if (
              curve.target ===
              'PartOpacity'
            ) {
              partOpacities[
                curve.id
              ] =
                curve.value


              partOpacityOwners[
                curve.id
              ] =
                activeState.actionId


              return
            }


            /*
              ----------------------------
              MODEL CURVE
              ----------------------------

              Không vứt bỏ.

              Bước sau sẽ quyết định
              cách apply từng loại Model curve.
            */

            if (
              curve.target ===
              'Model'
            ) {
              modelCurves[
                curve.id
              ] =
                curve.value


              modelCurveOwners[
                curve.id
              ] =
                activeState.actionId
            }
          }
        )
      }
    )


    const state =
      this.getState()


    return {
      parameters,

      partOpacities,

      modelCurves,

      parameterOwners,

      partOpacityOwners,

      modelCurveOwners,

      activeToggleActionIds:
        state.activeToggleActionIds,

      activeOneshotActionIds:
        state.activeOneshotActionIds
    }
  }


  /*
    ==========================================================
    CLEAR MODEL
    ==========================================================

    Dùng khi:
      - đổi model
      - unload model

    Xóa cả registry và active state
    để action model cũ không leak
    sang model mới.
  */


  clearModel():
    void {
    this.activeToggles.clear()
    this.activeOneshots.clear()

    this.registry.clear()
    this.modeOverrides.clear()

    this.nextActivationOrder =
      1


    this.emitState()
  }


  /*
    ==========================================================
    DESTROY
    ==========================================================
  */


  destroy():
    void {
    this.activeToggles.clear()
    this.activeOneshots.clear()

    this.registry.clear()
    this.modeOverrides.clear()

    this.listeners.clear()

    this.nextActivationOrder =
      1
  }


  /*
    ==========================================================
    PRIVATE: ACTIVATION ORDER
    ==========================================================
  */


  private takeActivationOrder():
    number {
    const value =
      this.nextActivationOrder


    this.nextActivationOrder++


    /*
      Không thực tế để đạt tới đây,
      nhưng tránh integer tăng vô hạn.
    */

    if (
      this.nextActivationOrder >=
      Number.MAX_SAFE_INTEGER
    ) {
      this.rebuildActivationOrder()
    }


    return value
  }


  private rebuildActivationOrder():
    void {
    const allStates =
      [
        ...this.activeToggles
          .values(),

        ...this.activeOneshots
          .values()
      ]
        .sort(
          (
            left,
            right
          ) =>
            left.activationOrder -
            right.activationOrder
        )


    let order =
      1


    allStates.forEach(
      state => {
        state.activationOrder =
          order

        order++
      }
    )


    this.nextActivationOrder =
      order
  }


  /*
    ==========================================================
    PRIVATE: REMOVE FINISHED ONESHOT
    ==========================================================
  */


  private removeFinishedOneshots(
    nowMs:
      number
  ): boolean {
    let removed =
      false


    for (
      const [
        actionId,
        activeState
      ] of this.activeOneshots
    ) {
      const registered =
        this.registry.get(
          actionId
        )


      if (
        !registered
      ) {
        this.activeOneshots.delete(
          actionId
        )

        removed =
          true

        continue
      }


      const durationSeconds =
        getAnalysisDuration(
          registered.analysis
        )


      const elapsedSeconds =
        Math.max(
          0,
          (
            nowMs -
            activeState.startedAtMs
          ) /
          1000
        )


      if (
        elapsedSeconds >=
        durationSeconds
      ) {
        this.activeOneshots.delete(
          actionId
        )

        removed =
          true
      }
    }


    return removed
  }


  /*
    ==========================================================
    PRIVATE: SORT STATE
    ==========================================================
  */


  private getSortedActiveStates(
    source:
      Map<
        string,
        ActiveMotionState
      >
  ):
    ActiveMotionState[] {
    return [
      ...source.values()
    ]
      .sort(
        (
          left,
          right
        ) =>
          left.activationOrder -
          right.activationOrder
      )
  }


  /*
    ==========================================================
    PRIVATE: EMIT
    ==========================================================
  */


  private emitState(
    state:
      MultiActionStateSnapshot =
        this.getState()
  ): void {
    this.listeners.forEach(
      listener => {
        try {
          listener(
            state
          )
        }
        catch (error) {
          console.error(
            '[MultiAction] State listener failed:',
            error
          )
        }
      }
    )
  }
}