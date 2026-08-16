import type {
  Live2DActionMetadata,
  Live2DActionMode
} from './types'


/*
  ============================================================
  MOTION3 JSON TYPES
  ============================================================

  Bước 4 không chỉ đọc metadata nữa.

  File này sẽ giữ lại toàn bộ curve cần thiết để
  Bước 5 có thể tự evaluate motion theo thời gian,
  thay vì bắt buộc phải chạy tất cả action qua
  pixi-live2d-display MotionManager.
*/


export type MotionCurveTarget =
  | 'Model'
  | 'Parameter'
  | 'PartOpacity'
  | string


export type MotionSegmentType =
  | 'linear'
  | 'bezier'
  | 'stepped'
  | 'inverse-stepped'


export type MotionPoint = {
  time: number

  value: number
}


export type MotionLinearSegment = {
  type: 'linear'

  start: MotionPoint

  end: MotionPoint
}


export type MotionBezierSegment = {
  type: 'bezier'

  start: MotionPoint

  control1: MotionPoint

  control2: MotionPoint

  end: MotionPoint
}


export type MotionSteppedSegment = {
  type: 'stepped'

  start: MotionPoint

  end: MotionPoint
}


export type MotionInverseSteppedSegment = {
  type: 'inverse-stepped'

  start: MotionPoint

  end: MotionPoint
}


export type MotionSegment =
  | MotionLinearSegment
  | MotionBezierSegment
  | MotionSteppedSegment
  | MotionInverseSteppedSegment


type Motion3Curve = {
  Target?:
    MotionCurveTarget

  Id?:
    string

  FadeInTime?:
    number

  FadeOutTime?:
    number

  Segments?:
    unknown[]
}


type Motion3Meta = {
  Duration?:
    number

  Fps?:
    number

  Loop?:
    boolean

  AreBeziersRestricted?:
    boolean
}


type Motion3Json = {
  Version?:
    number

  Meta?:
    Motion3Meta

  Curves?:
    Motion3Curve[]
}


/*
  ============================================================
  PARSED CURVE
  ============================================================

  Đây là dữ liệu Bước 5 sẽ dùng trực tiếp.

  Ví dụ:

    ParamArmLA

      t=0.0 -> 0
      t=0.4 -> 0.5
      t=0.8 -> 1

  segments chứa đủ dữ liệu để tính value tại bất kỳ
  thời điểm nào trong motion.
*/


export type MotionCurveSummary = {
  target:
    MotionCurveTarget

  id:
    string

  fadeInTime:
    number | null

  fadeOutTime:
    number | null

  startTime:
    number | null

  endTime:
    number | null

  startValue:
    number | null

  endValue:
    number | null

  delta:
    number | null

  holdsAtEnd:
    boolean

  /*
    true khi curve kết thúc ở một trạng thái
    khác đáng kể so với lúc bắt đầu.

    Đây là tín hiệu quan trọng nhất cho các
    action kiểu:
      - raise arm
      - tail up
      - hat on
      - accessory on
  */

  isPersistentState:
    boolean

  segments:
    MotionSegment[]
}


/*
  ============================================================
  ANALYSIS RESULT
  ============================================================
*/


export type MotionAnalysis = {
  metadata:
    Live2DActionMetadata

  duration:
    number | null

  fps:
    number | null

  loop:
    boolean

  /*
    Cubism có hai cách evaluate Bezier.

    true:
      Bezier restricted.
      Có thể dùng normalized time trực tiếp.

    false:
      Phải giải time theo trục X của Bezier.
  */

  areBeziersRestricted:
    boolean

  curves:
    MotionCurveSummary[]

  reasons:
    string[]
}


export type EvaluatedMotionCurve = {
  target:
    MotionCurveTarget

  id:
    string

  value:
    number
}


/*
  ============================================================
  CONSTANTS
  ============================================================
*/


/*
  Một Parameter kết thúc khác trạng thái ban đầu
  đã đủ mạnh để xem là toggle candidate.

  Trước đây threshold = 0.45 nhưng một parameter
  persistent chỉ được +0.35, làm RaiseArm/TailUp
  rất dễ bị nhận nhầm thành oneshot.
*/

const TOGGLE_SCORE_THRESHOLD =
  0.50


const VALUE_DELTA_EPSILON =
  0.001


const PART_OPACITY_SIGNIFICANT_DELTA =
  0.20


const PARAMETER_SIGNIFICANT_DELTA =
  0.05


const END_HOLD_EPSILON =
  0.01


/*
  Số vòng binary search cho Bezier không restricted.

  24 vòng là quá đủ cho motion real-time và vẫn rất nhẹ.
*/

const BEZIER_SEARCH_ITERATIONS =
  24


/*
  ============================================================
  BASIC HELPERS
  ============================================================
*/


function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value ===
      'object' &&
    value !==
      null
  )
}


function toFiniteNumber(
  value: unknown
): number | null {
  if (
    typeof value !==
    'number'
  ) {
    return null
  }


  if (
    !Number.isFinite(
      value
    )
  ) {
    return null
  }


  return value
}


function clamp01(
  value: number
): number {
  return Math.min(
    1,
    Math.max(
      0,
      value
    )
  )
}


function clonePoint(
  point: MotionPoint
): MotionPoint {
  return {
    time:
      point.time,

    value:
      point.value
  }
}


function uniqueStrings(
  values: string[]
): string[] {
  return [
    ...new Set(
      values
    )
  ]
}


/*
  ============================================================
  NORMALIZE MOTION3 JSON
  ============================================================

  User có thể import model ngoài.

  Vì vậy không tin tuyệt đối shape của JSON.
  File thiếu field sẽ không làm app crash.
*/


function normalizeMotion3Json(
  input: unknown
): Motion3Json {
  if (
    !isRecord(
      input
    )
  ) {
    return {}
  }


  const result:
    Motion3Json = {}


  const version =
    toFiniteNumber(
      input.Version
    )


  if (
    version !==
    null
  ) {
    result.Version =
      version
  }


  /*
    ------------------------------
    META
    ------------------------------
  */

  if (
    isRecord(
      input.Meta
    )
  ) {
    const meta:
      Motion3Meta = {}


    const duration =
      toFiniteNumber(
        input.Meta.Duration
      )


    if (
      duration !==
      null
    ) {
      meta.Duration =
        duration
    }


    const fps =
      toFiniteNumber(
        input.Meta.Fps
      )


    if (
      fps !==
      null
    ) {
      meta.Fps =
        fps
    }


    if (
      typeof input.Meta.Loop ===
      'boolean'
    ) {
      meta.Loop =
        input.Meta.Loop
    }


    if (
      typeof input.Meta
        .AreBeziersRestricted ===
      'boolean'
    ) {
      meta.AreBeziersRestricted =
        input.Meta
          .AreBeziersRestricted
    }


    result.Meta =
      meta
  }


  /*
    ------------------------------
    CURVES
    ------------------------------
  */

  if (
    Array.isArray(
      input.Curves
    )
  ) {
    result.Curves =
      input.Curves
        .filter(
          isRecord
        )
        .map(
          curve => {
            const normalized:
              Motion3Curve = {}


            if (
              typeof curve.Target ===
              'string'
            ) {
              normalized.Target =
                curve.Target
            }


            if (
              typeof curve.Id ===
              'string'
            ) {
              normalized.Id =
                curve.Id
            }


            const fadeInTime =
              toFiniteNumber(
                curve.FadeInTime
              )


            if (
              fadeInTime !==
              null
            ) {
              normalized.FadeInTime =
                fadeInTime
            }


            const fadeOutTime =
              toFiniteNumber(
                curve.FadeOutTime
              )


            if (
              fadeOutTime !==
              null
            ) {
              normalized.FadeOutTime =
                fadeOutTime
            }


            if (
              Array.isArray(
                curve.Segments
              )
            ) {
              normalized.Segments =
                curve.Segments
            }


            return normalized
          }
        )
  }


  return result
}


/*
  ============================================================
  READ POINT
  ============================================================
*/


function readPoint(
  values: unknown[],
  timeIndex: number,
  valueIndex: number
): MotionPoint | null {
  const time =
    toFiniteNumber(
      values[
        timeIndex
      ]
    )


  const value =
    toFiniteNumber(
      values[
        valueIndex
      ]
    )


  if (
    time ===
      null ||
    value ===
      null
  ) {
    return null
  }


  return {
    time,

    value
  }
}


/*
  ============================================================
  PARSE CUBISM SEGMENTS
  ============================================================

  Cubism motion3.json:

    Segments:
    [
      firstTime,
      firstValue,

      segmentType,
      ...
    ]

  Segment type:

    0 = Linear
        type,
        endTime,
        endValue

    1 = Bezier
        type,
        control1Time,
        control1Value,
        control2Time,
        control2Value,
        endTime,
        endValue

    2 = Stepped
        type,
        endTime,
        endValue

    3 = Inverse Stepped
        type,
        endTime,
        endValue
*/


function parseSegments(
  rawSegments: unknown[]
): {
  segments: MotionSegment[]

  endpoints: MotionPoint[]
} {
  if (
    rawSegments.length <
    2
  ) {
    return {
      segments:
        [],

      endpoints:
        []
    }
  }


  const firstPoint =
    readPoint(
      rawSegments,
      0,
      1
    )


  if (
    !firstPoint
  ) {
    return {
      segments:
        [],

      endpoints:
        []
    }
  }


  const segments:
    MotionSegment[] =
      []


  const endpoints:
    MotionPoint[] = [
      clonePoint(
        firstPoint
      )
    ]


  let currentPoint =
    firstPoint


  let cursor =
    2


  while (
    cursor <
    rawSegments.length
  ) {
    const rawSegmentType =
      toFiniteNumber(
        rawSegments[
          cursor
        ]
      )


    if (
      rawSegmentType ===
      null
    ) {
      break
    }


    /*
      ========================================================
      LINEAR
      ========================================================
    */

    if (
      rawSegmentType ===
      0
    ) {
      const end =
        readPoint(
          rawSegments,
          cursor + 1,
          cursor + 2
        )


      if (
        !end
      ) {
        break
      }


      segments.push({
        type:
          'linear',

        start:
          clonePoint(
            currentPoint
          ),

        end:
          clonePoint(
            end
          )
      })


      currentPoint =
        end


      endpoints.push(
        clonePoint(
          end
        )
      )


      cursor +=
        3


      continue
    }


    /*
      ========================================================
      BEZIER
      ========================================================
    */

    if (
      rawSegmentType ===
      1
    ) {
      const control1 =
        readPoint(
          rawSegments,
          cursor + 1,
          cursor + 2
        )


      const control2 =
        readPoint(
          rawSegments,
          cursor + 3,
          cursor + 4
        )


      const end =
        readPoint(
          rawSegments,
          cursor + 5,
          cursor + 6
        )


      if (
        !control1 ||
        !control2 ||
        !end
      ) {
        break
      }


      segments.push({
        type:
          'bezier',

        start:
          clonePoint(
            currentPoint
          ),

        control1:
          clonePoint(
            control1
          ),

        control2:
          clonePoint(
            control2
          ),

        end:
          clonePoint(
            end
          )
      })


      currentPoint =
        end


      endpoints.push(
        clonePoint(
          end
        )
      )


      cursor +=
        7


      continue
    }


    /*
      ========================================================
      STEPPED
      ========================================================
    */

    if (
      rawSegmentType ===
      2
    ) {
      const end =
        readPoint(
          rawSegments,
          cursor + 1,
          cursor + 2
        )


      if (
        !end
      ) {
        break
      }


      segments.push({
        type:
          'stepped',

        start:
          clonePoint(
            currentPoint
          ),

        end:
          clonePoint(
            end
          )
      })


      currentPoint =
        end


      endpoints.push(
        clonePoint(
          end
        )
      )


      cursor +=
        3


      continue
    }


    /*
      ========================================================
      INVERSE STEPPED
      ========================================================
    */

    if (
      rawSegmentType ===
      3
    ) {
      const end =
        readPoint(
          rawSegments,
          cursor + 1,
          cursor + 2
        )


      if (
        !end
      ) {
        break
      }


      segments.push({
        type:
          'inverse-stepped',

        start:
          clonePoint(
            currentPoint
          ),

        end:
          clonePoint(
            end
          )
      })


      currentPoint =
        end


      endpoints.push(
        clonePoint(
          end
        )
      )


      cursor +=
        3


      continue
    }


    /*
      Segment type không biết.

      Dừng parser thay vì đọc nhầm index.
    */

    break
  }


  return {
    segments,

    endpoints
  }
}


/*
  ============================================================
  PERSISTENT CURVE DETECTION
  ============================================================

  Đây là thay đổi quan trọng cho Multi Action.

  Một motion file thường chứa rất nhiều curve,
  kể cả những parameter chỉ được ghi giá trị mặc định.

  Ví dụ RaiseRightArm có thể vẫn chứa:

    ParamArmLeft:
      0 -> 0

  Nếu controller apply curve đó, nó sẽ vô tình
  kéo tay trái xuống khi user vừa bật RaiseLeftArm.

  Vì vậy ta phân biệt:

    persistent curve
      = giá trị cuối khác đáng kể giá trị đầu

    neutral / helper curve
      = cuối quay về đầu hoặc không đổi

  Với toggle không-loop, controller chỉ giữ lại
  persistent curves.
*/


function hasPersistentDelta(
  target: MotionCurveTarget,
  delta: number | null
): boolean {
  if (
    delta ===
    null
  ) {
    return false
  }


  if (
    target ===
    'PartOpacity'
  ) {
    return (
      Math.abs(
        delta
      ) >=
      PART_OPACITY_SIGNIFICANT_DELTA
    )
  }


  if (
    target ===
    'Parameter'
  ) {
    return (
      Math.abs(
        delta
      ) >=
      PARAMETER_SIGNIFICANT_DELTA
    )
  }


  return false
}


export function isPersistentMotionCurve(
  curve: MotionCurveSummary
): boolean {
  return curve.isPersistentState
}


/*
  ============================================================
  ANALYZE ONE CURVE
  ============================================================
*/


function analyzeCurve(
  curve: Motion3Curve
): MotionCurveSummary | null {
  if (
    typeof curve.Target !==
      'string' ||
    typeof curve.Id !==
      'string'
  ) {
    return null
  }


  const parsed =
    parseSegments(
      Array.isArray(
        curve.Segments
      )
        ? curve.Segments
        : []
    )


  if (
    parsed.endpoints.length ===
    0
  ) {
    return {
      target:
        curve.Target,

      id:
        curve.Id,

      fadeInTime:
        curve.FadeInTime ??
        null,

      fadeOutTime:
        curve.FadeOutTime ??
        null,

      startTime:
        null,

      endTime:
        null,

      startValue:
        null,

      endValue:
        null,

      delta:
        null,

      holdsAtEnd:
        false,

      isPersistentState:
        false,

      segments:
        []
    }
  }


  const startPoint =
    parsed.endpoints[0]


  const endPoint =
    parsed.endpoints[
      parsed.endpoints.length -
      1
    ]


  const delta =
    endPoint.value -
    startPoint.value


  const isPersistentState =
    hasPersistentDelta(
      curve.Target,
      delta
    )


  /*
    Chỉ coi là "hold ở cuối" khi có tối thiểu
    3 endpoint:

      0 -> 1 -> 1

    Còn chỉ:

      0 -> 1

    thì chưa đủ bằng chứng rằng tác giả cố ý
    giữ state ở đoạn cuối.
  */

  let holdsAtEnd =
    false


  if (
    parsed.endpoints.length >=
    3
  ) {
    const previousPoint =
      parsed.endpoints[
        parsed.endpoints.length -
        2
      ]


    holdsAtEnd =
      Math.abs(
        endPoint.value -
        previousPoint.value
      ) <=
      END_HOLD_EPSILON
  }


  return {
    target:
      curve.Target,

    id:
      curve.Id,

    fadeInTime:
      curve.FadeInTime ??
      null,

    fadeOutTime:
      curve.FadeOutTime ??
      null,

    startTime:
      startPoint.time,

    endTime:
      endPoint.time,

    startValue:
      startPoint.value,

    endValue:
      endPoint.value,

    delta,

    holdsAtEnd,

    isPersistentState,

    segments:
      parsed.segments
  }
}


/*
  ============================================================
  PERSISTENT CLASSIFIER
  ============================================================
*/


function calculatePersistentScore(
  loop: boolean,
  curves: MotionCurveSummary[],
  reasons: string[]
): number {
  let score =
    0


  /*
    ==========================================================
    LOOP
    ==========================================================

    Loop tự nhiên cần nút bật / tắt.
  */

  if (
    loop
  ) {
    score +=
      0.90


    reasons.push(
      'motion loops'
    )
  }


  const persistentPartOpacityCurves =
    curves.filter(
      curve =>
        curve.target ===
          'PartOpacity' &&
        curve.isPersistentState
    )


  const persistentParameterCurves =
    curves.filter(
      curve =>
        curve.target ===
          'Parameter' &&
        curve.isPersistentState
    )


  /*
    ==========================================================
    PART OPACITY STATE
    ==========================================================

    0 -> 1 hoặc 1 -> 0 thường là:
      - accessory on/off
      - hat on/off
      - part swap

    Đây là tín hiệu toggle rất mạnh.
  */

  if (
    persistentPartOpacityCurves.length >
    0
  ) {
    score +=
      0.90


    reasons.push(
      'PartOpacity ends in a different persistent state'
    )
  }


  /*
    ==========================================================
    PARAMETER STATE
    ==========================================================

    QUAN TRỌNG:

    Trước đây chỉ cộng 0.35 nên một motion như:

      ParamArmL:
        0 -> 1

    có score 0.35 và bị nhận thành oneshot
    vì threshold là 0.45.

    Bây giờ chỉ cần một Parameter thực sự kết thúc
    khác trạng thái ban đầu là đủ để trở thành
    toggle candidate.
  */

  if (
    persistentParameterCurves.length >
    0
  ) {
    score +=
      0.60


    reasons.push(
      'parameter ends in a different persistent state'
    )
  }


  /*
    Plateau cuối làm bằng chứng mạnh hơn,
    nhưng không còn là điều kiện bắt buộc.

    Nhiều motion RaiseArm chỉ có:
      0 -> 1

    chứ không có:
      0 -> 1 -> 1
  */

  if (
    persistentParameterCurves.some(
      curve =>
        curve.holdsAtEnd
    )
  ) {
    score +=
      0.10


    reasons.push(
      'parameter holds its final value'
    )
  }


  if (
    persistentParameterCurves.length >=
      2
  ) {
    score +=
      0.10


    reasons.push(
      'multiple parameters end in changed states'
    )
  }


  return clamp01(
    score
  )
}

function suggestModeFromScore(
  persistentScore: number
): Live2DActionMode {
  if (
    persistentScore >=
    TOGGLE_SCORE_THRESHOLD
  ) {
    return 'toggle'
  }


  return 'oneshot'
}


/*
  ============================================================
  CURVE EVALUATION HELPERS
  ============================================================
*/


function normalizeLinearProgress(
  time: number,
  startTime: number,
  endTime: number
): number {
  const duration =
    endTime -
    startTime


  if (
    Math.abs(
      duration
    ) <=
    Number.EPSILON
  ) {
    return 1
  }


  return clamp01(
    (
      time -
      startTime
    ) /
    duration
  )
}


function lerp(
  from: number,
  to: number,
  t: number
): number {
  return (
    from +
    (
      to -
      from
    ) *
    t
  )
}


function cubicBezierValue(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number
): number {
  const inverse =
    1 -
    t


  return (
    inverse *
      inverse *
      inverse *
      p0 +

    3 *
      inverse *
      inverse *
      t *
      p1 +

    3 *
      inverse *
      t *
      t *
      p2 +

    t *
      t *
      t *
      p3
  )
}


/*
  ============================================================
  RESTRICTED BEZIER
  ============================================================

  Cubism SDK restricted Bezier dùng progress giữa
  startTime và endTime làm t trực tiếp, sau đó evaluate
  cubic Bezier trên value.
*/


function evaluateRestrictedBezier(
  segment: MotionBezierSegment,
  time: number
): number {
  const t =
    normalizeLinearProgress(
      time,
      segment.start.time,
      segment.end.time
    )


  return cubicBezierValue(
    segment.start.value,
    segment.control1.value,
    segment.control2.value,
    segment.end.value,
    t
  )
}


/*
  ============================================================
  UNRESTRICTED BEZIER
  ============================================================

  Với Bezier không restricted, control point X/time
  có ý nghĩa thật.

  Ta tìm u sao cho:

    BezierTime(u) ~= requestedTime

  rồi evaluate BezierValue(u).

  Đây là lý do Bước 4 phải giữ cả:
    control1.time
    control2.time
*/


function evaluateUnrestrictedBezier(
  segment: MotionBezierSegment,
  time: number
): number {
  if (
    time <=
    segment.start.time
  ) {
    return segment.start.value
  }


  if (
    time >=
    segment.end.time
  ) {
    return segment.end.value
  }


  let lower =
    0


  let upper =
    1


  for (
    let iteration =
      0;

    iteration <
      BEZIER_SEARCH_ITERATIONS;

    iteration++
  ) {
    const middle =
      (
        lower +
        upper
      ) /
      2


    const middleTime =
      cubicBezierValue(
        segment.start.time,
        segment.control1.time,
        segment.control2.time,
        segment.end.time,
        middle
      )


    if (
      middleTime <
      time
    ) {
      lower =
        middle
    }
    else {
      upper =
        middle
    }
  }


  const t =
    (
      lower +
      upper
    ) /
    2


  return cubicBezierValue(
    segment.start.value,
    segment.control1.value,
    segment.control2.value,
    segment.end.value,
    t
  )
}


/*
  ============================================================
  PUBLIC: EVALUATE ONE SEGMENT
  ============================================================
*/


export function evaluateMotionSegment(
  segment: MotionSegment,
  time: number,
  areBeziersRestricted = true
): number {
  if (
    segment.type ===
    'linear'
  ) {
    const t =
      normalizeLinearProgress(
        time,
        segment.start.time,
        segment.end.time
      )


    return lerp(
      segment.start.value,
      segment.end.value,
      t
    )
  }


  if (
    segment.type ===
    'bezier'
  ) {
    if (
      areBeziersRestricted
    ) {
      return evaluateRestrictedBezier(
        segment,
        time
      )
    }


    return evaluateUnrestrictedBezier(
      segment,
      time
    )
  }


  if (
    segment.type ===
    'stepped'
  ) {
    /*
      Cubism Stepped:
      giữ start value trong segment.
    */

    return segment.start.value
  }


  /*
    Cubism Inverse Stepped:
    dùng ngay end value.
  */

  return segment.end.value
}


/*
  ============================================================
  PUBLIC: EVALUATE ONE CURVE
  ============================================================

  Quan trọng:

  Cubism chọn segment khi:
      segment.end.time > currentTime

  Không dùng >=.

  Nhờ vậy behavior ở đúng keyframe boundary gần với
  Cubism SDK hơn, đặc biệt với Stepped / Inverse Stepped.
*/


export function evaluateMotionCurve(
  curve: MotionCurveSummary,
  time: number,
  areBeziersRestricted = true
): number | null {
  if (
    curve.startValue ===
      null ||
    curve.endValue ===
      null ||
    curve.startTime ===
      null ||
    curve.endTime ===
      null
  ) {
    return null
  }


  if (
    time <=
    curve.startTime
  ) {
    return curve.startValue
  }


  for (
    const segment of
    curve.segments
  ) {
    if (
      segment.end.time >
      time
    ) {
      return evaluateMotionSegment(
        segment,
        time,
        areBeziersRestricted
      )
    }
  }


  return curve.endValue
}


/*
  ============================================================
  MOTION TIME
  ============================================================

  Controller sau này sẽ dùng helper này.

  loop = true:
    elapsed chạy vòng lại.

  loop = false:
    giữ ở final frame nếu elapsed vượt duration.

  Chú ý:
    việc "toggle OFF" sẽ do MultiActionController quản lý,
    không phải function này.
*/


export function normalizeMotionTime(
  elapsedSeconds: number,
  duration: number | null,
  loop: boolean
): number {
  const safeElapsed =
    Math.max(
      0,
      Number.isFinite(
        elapsedSeconds
      )
        ? elapsedSeconds
        : 0
    )


  if (
    duration ===
      null ||
    duration <=
      0
  ) {
    return safeElapsed
  }


  if (
    loop
  ) {
    return (
      safeElapsed %
      duration
    )
  }


  return Math.min(
    safeElapsed,
    duration
  )
}


/*
  ============================================================
  PUBLIC: EVALUATE WHOLE MOTION
  ============================================================

  Trả về value của tất cả curve tại thời điểm elapsedSeconds.

  Bước 5 sẽ lọc:
    Parameter
    PartOpacity

  rồi apply trực tiếp lên Cubism model.
*/


export function evaluateMotionAnalysis(
  analysis: MotionAnalysis,
  elapsedSeconds: number
): EvaluatedMotionCurve[] {
  const time =
    normalizeMotionTime(
      elapsedSeconds,
      analysis.duration,
      analysis.loop
    )


  const result:
    EvaluatedMotionCurve[] =
      []


  analysis.curves.forEach(
    curve => {
      const value =
        evaluateMotionCurve(
          curve,
          time,
          analysis.areBeziersRestricted
        )


      if (
        value ===
        null ||
        !Number.isFinite(
          value
        )
      ) {
        return
      }


      result.push({
        target:
          curve.target,

        id:
          curve.id,

        value
      })
    }
  )


  return result
}


/*
  ============================================================
  PUBLIC: ANALYZE MOTION3 JSON
  ============================================================
*/


export function analyzeMotion3Json(
  input: unknown,
  sourceFile:
    string | null =
      null
): MotionAnalysis {
  const motion =
    normalizeMotion3Json(
      input
    )


  const duration =
    motion.Meta
      ?.Duration ??
    null


  const fps =
    motion.Meta
      ?.Fps ??
    null


  const loop =
    motion.Meta
      ?.Loop ===
    true


  /*
    Cubism motion cũ có thể không có field này.

    Với file không khai báo, dùng true là fallback an toàn
    cho đa số motion export mới và cũng tránh việc giải
    Bezier X không cần thiết.

    Nếu JSON ghi false rõ ràng thì dùng unrestricted evaluator.
  */

  const areBeziersRestricted =
    motion.Meta
      ?.AreBeziersRestricted !==
    false


  const curves =
    (
      motion.Curves ??
      []
    )
      .map(
        analyzeCurve
      )
      .filter(
        (
          curve
        ): curve is MotionCurveSummary =>
          curve !==
          null
      )


  const parameterIds =
    uniqueStrings(
      curves
        .filter(
          curve =>
            curve.target ===
            'Parameter'
        )
        .map(
          curve =>
            curve.id
        )
    )


  const partOpacityIds =
    uniqueStrings(
      curves
        .filter(
          curve =>
            curve.target ===
            'PartOpacity'
        )
        .map(
          curve =>
            curve.id
        )
    )


  const reasons:
    string[] =
      []


  const persistentScore =
    calculatePersistentScore(
      loop,
      curves,
      reasons
    )


  const suggestedMode =
    suggestModeFromScore(
      persistentScore
    )


  const modeSource =
    persistentScore >
      VALUE_DELTA_EPSILON
      ? 'auto' as const
      : 'fallback' as const


  const metadata:
    Live2DActionMetadata = {
      mode:
        suggestedMode,

      suggestedMode,

      modeSource,

      duration,

      loop,

      sourceFile,

      parameterIds,

      partOpacityIds,

      persistentScore
    }


  return {
    metadata,

    duration,

    fps,

    loop,

    areBeziersRestricted,

    curves,

    reasons
  }
}


/*
  ============================================================
  PUBLIC: METADATA ONLY
  ============================================================

  Live2DStage.vue Bước 3 đang dùng function này.

  Vì vậy giữ nguyên API để Bước 4 có thể được thay trực tiếp
  mà không phải sửa Live2DStage.vue ngay.
*/


export function getMotionActionMetadata(
  input: unknown,
  sourceFile:
    string | null =
      null
): Live2DActionMetadata {
  return analyzeMotion3Json(
    input,
    sourceFile
  ).metadata
}