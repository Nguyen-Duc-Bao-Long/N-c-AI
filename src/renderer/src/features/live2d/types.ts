/*
  ============================================================
  ACTION MODE
  ============================================================

  oneshot:
    Action chạy một lần rồi kết thúc.

    Ví dụ:
    - Wave
    - Blink
    - Nod
    - Jump
    - Dance


  toggle:
    Action biểu diễn một trạng thái.

    Click lần 1:
      OFF -> ON

    Click lần 2:
      ON -> OFF

    Ví dụ:
    - Raise Arm
    - Tail Up
    - Hat On
    - Glasses On
    - Accessory On
*/

export type Live2DActionMode =
  | 'oneshot'
  | 'toggle'


/*
  ============================================================
  ACTION CLASSIFICATION SOURCE
  ============================================================

  auto:
    App tự phân tích motion3.json.

  override:
    User/config đã ép loại action.

  fallback:
    Không đủ thông tin,
    hệ thống dùng mặc định.
*/

export type Live2DActionModeSource =
  | 'auto'
  | 'override'
  | 'fallback'


/*
  ============================================================
  ACTION METADATA
  ============================================================

  Thông tin được đọc từ:

    *.motion3.json

  Đây sẽ là nền tảng của
  Multi Action System.
*/

export type Live2DActionMetadata = {
  /*
    Mode cuối cùng mà engine
    sẽ sử dụng.

    Để optional trong giai đoạn
    nâng cấp để code cũ chưa bị vỡ.
  */

  mode?:
    Live2DActionMode


  /*
    App tự suy đoán action nên
    thuộc loại nào.

    Có thể khác mode nếu user
    override.
  */

  suggestedMode?:
    Live2DActionMode


  /*
    Vì sao mode hiện tại
    được chọn.
  */

  modeSource?:
    Live2DActionModeSource


  /*
    Meta.Duration trong
    motion3.json.

    Đơn vị:
      giây
  */

  duration?:
    number | null


  /*
    Meta.Loop
  */

  loop?:
    boolean


  /*
    URL/path file motion nguồn.

    Ví dụ:

    motions/
      RaiseArm.motion3.json
  */

  sourceFile?:
    string | null


  /*
    Các Cubism Parameter
    mà motion tác động.

    Ví dụ:

    [
      'ParamAngleX',
      'ParamArmLA'
    ]

    Sau này dùng để kiểm tra
    hai action có xung đột
    với nhau không.
  */

  parameterIds?:
    string[]


  /*
    Các PartOpacity
    mà motion tác động.

    Ví dụ:

    [
      'PartArmA',
      'PartArmB'
    ]

    Cực kỳ quan trọng với
    những model như Hiyori.
  */

  partOpacityIds?:
    string[]


  /*
    Motion có dấu hiệu giống
    một state/toggle hay không.

    Đây chỉ là heuristic.

    0:
      gần như oneshot.

    1:
      rất giống persistent state.
  */

  persistentScore?:
    number
}


/*
  ============================================================
  EXPRESSION ACTION
  ============================================================
*/

export type Live2DExpressionAction = {
  id:
    string


  type:
    'expression'


  label:
    string


  name:
    string


  metadata?:
    Live2DActionMetadata
}


/*
  ============================================================
  MOTION ACTION
  ============================================================
*/

export type Live2DMotionAction = {
  id:
    string


  type:
    'motion'


  label:
    string


  group:
    string


  index:
    number


  metadata?:
    Live2DActionMetadata
}


/*
  ============================================================
  LIVE2D ACTION
  ============================================================
*/

export type Live2DAction =
  | Live2DExpressionAction
  | Live2DMotionAction