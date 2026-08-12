export interface CharacterTransform {
  /*
    Hệ số scale bổ sung sau khi model
    đã được fit vào cửa sổ.

    1.0 = kích thước chuẩn
    0.9 = nhỏ hơn 10%
    1.2 = lớn hơn 20%
  */
  scale: number

  /*
    Vị trí theo tỉ lệ cửa sổ.

    x = 0   : trái
    x = 0.5 : giữa
    x = 1   : phải

    y = 0   : trên
    y = 0.5 : giữa
    y = 1   : dưới
  */
  x: number
  y: number
}


export interface CharacterConfig {
  /*
    ID dùng bên trong chương trình.
  */
  id: string

  /*
    Tên hiển thị.
  */
  name: string

  /*
    Đường dẫn tới .model3.json
  */
  modelUrl: string

  /*
    Scale và vị trí riêng của model.
  */
  transform: CharacterTransform
}