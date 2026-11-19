# Feature Specification: Quản lý bán hàng & tồn kho (MVP)

**Feature Branch**: `001-sales-inventory-mvp`

**Created**: 2026-11-19

**Status**: Draft

**Input**: User description: "Hệ thống quản lý bán hàng và tồn kho cơ bản trong monorepo hiện có: sản phẩm, danh mục, ảnh sản phẩm (MinIO), nhà cung cấp, nhập hàng, bán hàng, tồn kho và điều chỉnh tồn kho, dashboard và báo cáo, song ngữ vi/en, vai trò ADMIN/MANAGER/STAFF; app 1 = quản trị, app 2 = bán hàng; chưa triển khai trước khi đặc tả được duyệt."

## Hiện trạng hệ thống liên quan *(bối cảnh)*

Đã khảo sát repo trước khi viết đặc tả. Những điểm ảnh hưởng tới phạm vi:

- **App quản trị** (`admin`): đăng nhập dành cho tài khoản có quyền vào trang quản trị; đã có Dashboard, Người dùng, Vai trò, Quyền, Cài đặt, Thông báo, Tài khoản.
- **App người dùng** (`user`): hiện là cổng tự phục vụ cho người dùng cuối — tự đăng ký, đăng nhập Google, trang tài khoản, thông báo. Chưa có nghiệp vụ.
- **Phân quyền**: vai trò là động (tạo/sửa trong trang quản trị), mỗi người dùng một vai trò, mỗi quyền gắn với một thao tác; đã có vai trò hệ thống `Administrator` và `User` (vai trò mặc định khi tự đăng ký).
- **Đa ngôn ngữ**: cả hai app đã hỗ trợ vi/en, lưu ngôn ngữ theo tài khoản; lỗi từ hệ thống đã có mã ổn định.
- **Lưu trữ file**: chỉ có avatar lưu trên đĩa máy chủ; chưa có kho lưu trữ đối tượng.
- **Hạ tầng**: chạy trực tiếp trên máy chủ (không dùng Docker); chưa có tài liệu API dạng OpenAPI.

Đề xuất phân tách chức năng dựa trên hiện trạng:

| App | Vai trò hiện tại (giữ nguyên) | Bổ sung |
| --- | --- | --- |
| Quản trị (`admin`) | Quản trị người dùng, vai trò, quyền, cài đặt | Dashboard bán hàng, Sản phẩm, Danh mục, Nhà cung cấp, Nhập hàng, Tồn kho, Điều chỉnh tồn kho, Báo cáo |
| Bán hàng (`user`) | Tự đăng ký, tài khoản, thông báo cho người dùng cuối | Màn hình bán hàng (tra cứu sản phẩm, giỏ hàng, tạo đơn, ghi nhận thanh toán), Lịch sử bán hàng, Chi tiết đơn — **chỉ hiện với tài khoản có quyền bán hàng** |

Người tự đăng ký mặc định không có quyền bán hàng nên không thấy và không gọi được chức năng bán hàng; trải nghiệm hiện tại của họ không đổi.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Quản lý danh mục và sản phẩm (Priority: P1)

Quản lý (Manager) tạo danh mục, tạo sản phẩm với SKU, tên, mô tả, danh mục, đơn vị tính, giá nhập, giá bán, tồn tối thiểu, trạng thái; tìm theo tên/SKU, lọc theo danh mục và trạng thái, sắp xếp, phân trang; ngừng kinh doanh sản phẩm khi không bán nữa.

**Why this priority**: Mọi nghiệp vụ nhập, bán, tồn kho đều dựa trên danh mục sản phẩm. Không có sản phẩm thì không có gì để bán.

**Independent Test**: Tạo danh mục và vài sản phẩm, tìm theo SKU, lọc theo danh mục, ngừng kinh doanh một sản phẩm — có giá trị ngay như một danh mục hàng hoá.

**Acceptance Scenarios**:

1. **Given** quản lý có quyền tạo sản phẩm, **When** tạo sản phẩm với SKU chưa tồn tại và đủ trường bắt buộc, **Then** sản phẩm xuất hiện trong danh sách với tồn kho 0 và trạng thái đang kinh doanh.
2. **Given** đã có sản phẩm SKU `SP001`, **When** tạo sản phẩm khác cũng SKU `sp001`, **Then** hệ thống từ chối với thông báo SKU đã tồn tại (so sánh không phân biệt hoa thường).
3. **Given** danh sách 200 sản phẩm, **When** tìm "áo" và lọc danh mục "Thời trang", trạng thái "Đang kinh doanh", **Then** chỉ hiện sản phẩm khớp, có phân trang và tổng số kết quả.
4. **Given** sản phẩm đã có giao dịch, **When** quản lý ngừng kinh doanh, **Then** sản phẩm không còn chọn được khi bán/nhập mới, nhưng vẫn hiện đúng trong đơn cũ, lịch sử và báo cáo.
5. **Given** sản phẩm đã có giao dịch, **When** cố xoá vĩnh viễn, **Then** hệ thống không cho phép (chỉ cho ngừng kinh doanh).
6. **Given** danh mục đang có sản phẩm, **When** xoá danh mục, **Then** hệ thống từ chối và gợi ý ngừng sử dụng hoặc chuyển sản phẩm sang danh mục khác.

---

### User Story 2 - Quản lý ảnh sản phẩm (Priority: P2)

Quản lý tải lên nhiều ảnh cho một sản phẩm (JPEG, PNG, WebP), xem trước, chọn ảnh chính, thay ảnh, xoá ảnh. Ảnh được lưu riêng tư; người có quyền xem sản phẩm mới xem được ảnh.

**Why this priority**: Ảnh giúp nhân viên bán hàng nhận diện đúng sản phẩm, nhưng hệ thống vẫn vận hành được khi chưa có ảnh.

**Independent Test**: Tải 3 ảnh cho một sản phẩm, đặt ảnh thứ 2 làm ảnh chính, thay ảnh thứ 3, xoá ảnh thứ 1; danh sách sản phẩm và màn hình bán hàng hiện đúng ảnh chính.

**Acceptance Scenarios**:

1. **Given** sản phẩm chưa có ảnh, **When** tải lên ảnh hợp lệ đầu tiên, **Then** ảnh đó tự động là ảnh chính.
2. **Given** chọn file PDF hoặc ảnh vượt giới hạn dung lượng, **When** tải lên, **Then** hệ thống từ chối trước khi lưu và báo rõ lý do (sai định dạng / quá dung lượng).
3. **Given** file có đuôi `.jpg` nhưng nội dung không phải ảnh hợp lệ, **When** tải lên, **Then** hệ thống từ chối và không giữ lại file.
4. **Given** sản phẩm có 3 ảnh, **When** xoá ảnh chính, **Then** ảnh còn lại xếp đầu tiên trở thành ảnh chính.
5. **Given** người dùng bắt đầu tải ảnh nhưng bỏ dở (đóng trình duyệt), **When** quá thời hạn hoàn tất tải lên, **Then** file tải dở được dọn khỏi kho lưu trữ và không xuất hiện trong sản phẩm.
6. **Given** người không đăng nhập có được đường dẫn ảnh, **When** mở sau khi đường dẫn hết hạn, **Then** không xem được ảnh.

---

### User Story 3 - Quản lý nhà cung cấp và nhập hàng (Priority: P1)

Quản lý tạo nhà cung cấp; tạo phiếu nhập (nháp) gồm nhà cung cấp, ngày nhập, các dòng sản phẩm với số lượng, đơn giá nhập, chiết khấu; xác nhận phiếu để cộng tồn kho; huỷ phiếu nháp. Xem lịch sử nhập theo nhà cung cấp.

**Why this priority**: Nhập hàng là nguồn tạo tồn kho và giá vốn; không có nhập hàng thì không bán được.

**Independent Test**: Tạo nhà cung cấp, lập phiếu nhập 2 sản phẩm, xác nhận → tồn kho và giá vốn bình quân cập nhật, lịch sử biến động ghi 2 dòng nhập.

**Acceptance Scenarios**:

1. **Given** phiếu nhập ở trạng thái Nháp, **When** lưu/sửa, **Then** tồn kho không đổi.
2. **Given** phiếu Nháp hợp lệ, **When** xác nhận, **Then** tồn kho từng sản phẩm tăng đúng số lượng, giá vốn bình quân được tính lại, mỗi dòng sinh một bản ghi biến động "Nhập hàng" liên kết phiếu, phiếu chuyển sang Đã xác nhận.
3. **Given** phiếu đã xác nhận, **When** xác nhận lại (kể cả hai người bấm cùng lúc), **Then** chỉ một lần có hiệu lực; lần sau bị từ chối, tồn kho chỉ tăng một lần.
4. **Given** dòng có số lượng ≤ 0, đơn giá âm, hoặc chiết khấu lớn hơn thành tiền dòng, **When** lưu, **Then** hệ thống từ chối với lỗi theo từng dòng.
5. **Given** phiếu Nháp, **When** huỷ, **Then** phiếu chuyển Đã huỷ, không ảnh hưởng tồn kho, không sửa được nữa.
6. **Given** phiếu đã xác nhận, **When** sau đó giá nhập trên sản phẩm thay đổi, **Then** phiếu cũ vẫn giữ đơn giá đã nhập.
7. **Given** phiếu đã xác nhận, **When** quản lý huỷ phiếu, **Then** hệ thống không cho phép; nhập sai được sửa bằng phiếu điều chỉnh tồn (lý do Khác, ghi chú tham chiếu mã phiếu nhập).
8. **Given** nhà cung cấp có phiếu nhập, **When** mở chi tiết nhà cung cấp, **Then** thấy danh sách phiếu nhập và tổng giá trị đã nhập (chỉ tính phiếu đã xác nhận).

---

### User Story 4 - Bán hàng tại quầy (Priority: P1)

Nhân viên bán hàng (Staff) mở app bán hàng, tìm sản phẩm theo tên hoặc SKU, thêm vào giỏ, chỉnh số lượng, chiết khấu, nhập thông tin khách (không bắt buộc), chọn phương thức thanh toán, chốt đơn. Có thể lưu đơn nháp để hoàn tất sau.

**Why this priority**: Đây là nghiệp vụ tạo doanh thu, lý do chính của hệ thống.

**Independent Test**: Với sản phẩm đã có tồn kho, nhân viên tạo và chốt đơn 2 sản phẩm, thanh toán tiền mặt → tồn kho giảm, đơn hiện trong lịch sử bán với giá bán và giá vốn đã chốt.

**Acceptance Scenarios**:

1. **Given** sản phẩm còn 10, **When** chốt đơn bán 3, **Then** tồn còn 7, đơn Đã xác nhận, ghi biến động "Bán hàng", mỗi dòng lưu giá bán và giá vốn tại thời điểm chốt.
2. **Given** sản phẩm còn 2, **When** chốt đơn bán 5, **Then** hệ thống từ chối, chỉ rõ sản phẩm thiếu và số lượng còn; tồn kho không đổi, đơn vẫn là Nháp (nếu đã lưu).
3. **Given** sản phẩm còn 1 và hai nhân viên cùng chốt đơn bán 1 sản phẩm đó cùng lúc, **When** cả hai bấm chốt, **Then** đúng một đơn thành công, đơn còn lại nhận lỗi không đủ hàng; tồn kho không âm.
4. **Given** đơn Nháp, **When** lưu, **Then** tồn kho không đổi; có thể mở lại, sửa và chốt sau.
5. **Given** đơn đã xác nhận, **When** chốt lại lần nữa, **Then** bị từ chối, tồn kho chỉ giảm một lần.
6. **Given** đơn đã xác nhận, **When** người có quyền huỷ đơn, **Then** đơn chuyển Đã huỷ, tồn kho được cộng lại đúng số lượng, ghi biến động "Huỷ đơn bán", đơn không còn tính vào doanh thu/lợi nhuận.
7. **Given** nhân viên đang bán, **When** tìm "SP00", **Then** thấy sản phẩm đang kinh doanh khớp tên hoặc SKU kèm ảnh chính, giá bán và tồn hiện tại; sản phẩm ngừng kinh doanh không hiện.
8. **Given** người dùng tự đăng ký (vai trò mặc định), **When** đăng nhập app, **Then** không thấy menu bán hàng và mọi thao tác bán hàng đều bị từ chối.
9. **Given** ghi nhận thanh toán, **When** chọn phương thức Tiền mặt / Chuyển khoản / Khác và trạng thái thanh toán, **Then** đơn lưu đúng thông tin; trạng thái thanh toán chỉ là Chưa thanh toán hoặc Đã thanh toán (thanh toán toàn bộ một lần, không có thanh toán một phần).
10. **Given** đơn đã xác nhận nhưng Chưa thanh toán, **When** người có quyền ghi nhận thanh toán, **Then** đơn chuyển Đã thanh toán kèm phương thức và thời điểm; đơn đã thanh toán không chuyển ngược về chưa thanh toán.

---

### User Story 5 - Lịch sử và chi tiết đơn bán (Priority: P2)

Nhân viên xem lịch sử đơn bán (lọc theo ngày, trạng thái, phương thức thanh toán, tìm theo mã đơn/SĐT khách), mở chi tiết đơn.

**Why this priority**: Cần để tra cứu, đối soát cuối ca, xử lý khiếu nại; không chặn việc bán.

**Independent Test**: Sau khi có vài đơn, lọc đơn hôm nay đã xác nhận, mở chi tiết thấy đủ dòng hàng, chiết khấu, tổng tiền, thanh toán.

**Acceptance Scenarios**:

1. **Given** nhân viên chỉ có quyền xem đơn của mình, **When** mở lịch sử, **Then** chỉ thấy đơn mình tạo; quản lý thấy tất cả.
2. **Given** chi tiết đơn, **When** nhân viên (không có quyền xem giá vốn) mở, **Then** không thấy giá vốn và lợi nhuận.

---

### User Story 6 - Tồn kho, cảnh báo và điều chỉnh (Priority: P1)

Quản lý xem tồn hiện tại từng sản phẩm, lọc theo danh mục, trạng thái tồn (bình thường / sắp hết / hết hàng); xem sổ biến động (nhập, bán, huỷ, điều chỉnh); tạo phiếu điều chỉnh tồn với lý do bắt buộc (Hư hỏng, Mất, Kiểm kê, Khác).

**Why this priority**: Đảm bảo số liệu tồn chính xác — điều kiện để bán không âm kho và báo cáo đúng.

**Independent Test**: Điều chỉnh giảm 2 sản phẩm do hư hỏng → tồn giảm, sổ biến động có dòng điều chỉnh kèm lý do và người thực hiện; sản phẩm dưới mức tối thiểu hiện trong cảnh báo.

**Acceptance Scenarios**:

1. **Given** tồn 5, **When** điều chỉnh -2 lý do Hư hỏng, **Then** tồn còn 3, sổ biến động có dòng điều chỉnh kèm lý do, ghi chú, người thực hiện, thời điểm.
2. **Given** tồn 5, **When** điều chỉnh -6, **Then** bị từ chối vì tồn không được âm.
3. **Given** kiểm kê đếm thực tế 8 trong khi hệ thống ghi 5, **When** tạo điều chỉnh lý do Kiểm kê với số lượng thực tế 8, **Then** hệ thống ghi chênh lệch +3 và tồn thành 8.
4. **Given** điều chỉnh không có lý do, **When** lưu, **Then** bị từ chối.
5. **Given** tồn tối thiểu 10 và tồn hiện tại 4, **When** xem tồn kho hoặc dashboard, **Then** sản phẩm nằm trong danh sách sắp hết; tồn 0 nằm trong danh sách hết hàng.
6. **Given** bất kỳ cách nào, **When** người dùng muốn sửa trực tiếp con số tồn (không qua nhập/bán/điều chỉnh), **Then** hệ thống không cung cấp cách làm đó.
7. **Given** sổ biến động của một sản phẩm, **When** cộng dồn mọi biến động, **Then** kết quả bằng tồn hiện tại.

---

### User Story 7 - Dashboard và báo cáo (Priority: P2)

Quản lý xem dashboard: tổng sản phẩm, tổng nhà cung cấp, tổng số lượng tồn, giá trị tồn kho, doanh thu và số đơn hôm nay, giá trị nhập hôm nay, danh sách sắp hết/hết hàng. Xem báo cáo theo khoảng ngày, sản phẩm, danh mục, nhà cung cấp: doanh thu theo ngày/tháng, bán theo sản phẩm, bán chạy, lịch sử nhập, tồn kho, biến động tồn, lợi nhuận gộp ước tính.

**Why this priority**: Giúp ra quyết định, nhưng chỉ có ý nghĩa sau khi đã có dữ liệu nhập/bán.

**Independent Test**: Với bộ dữ liệu mẫu đã biết trước (nhập 2 lần giá khác nhau, bán, huỷ 1 đơn), báo cáo lợi nhuận cho ra đúng doanh thu, giá vốn, lợi nhuận gộp tính tay.

**Acceptance Scenarios**:

1. **Given** nhập 10 sp giá 100.000₫ rồi nhập thêm 10 sp giá 120.000₫, **When** bán 5 sp, **Then** giá vốn mỗi sp bán là 110.000₫ (bình quân gia quyền), báo cáo tách rõ doanh thu, giá vốn hàng bán, lợi nhuận gộp.
2. **Given** sau khi bán, giá nhập trên sản phẩm bị sửa, **When** xem lại báo cáo lợi nhuận kỳ cũ, **Then** số liệu không đổi.
3. **Given** một đơn đã bị huỷ, **When** xem doanh thu và lợi nhuận, **Then** đơn đó không được tính.
4. **Given** bộ lọc khoảng ngày 01–31 và danh mục X, **When** xem báo cáo bán theo sản phẩm, **Then** chỉ tính đơn đã xác nhận trong khoảng ngày (theo giờ Việt Nam) thuộc danh mục X.
5. **Given** nhân viên không có quyền báo cáo, **When** truy cập báo cáo, **Then** bị từ chối.
6. **Given** ngôn ngữ là English, **When** xem dashboard, **Then** nhãn hiện tiếng Anh, tiền tệ vẫn là VND, định dạng số/ngày theo locale English.

---

### User Story 8 - Phân quyền theo vai trò ADMIN / MANAGER / STAFF (Priority: P1)

Quản trị viên gán vai trò cho người dùng; mỗi vai trò có bộ quyền mặc định theo ma trận bên dưới và có thể điều chỉnh trong trang quản trị như hiện nay.

**Why this priority**: Bảo vệ dữ liệu giá vốn, lợi nhuận và thao tác ảnh hưởng tồn kho ngay từ đầu.

**Independent Test**: Đăng nhập lần lượt 3 tài khoản 3 vai trò, kiểm tra menu hiển thị và thao tác bị chặn đúng ma trận.

**Acceptance Scenarios**:

1. **Given** tài khoản vai trò Staff, **When** gọi thao tác xác nhận phiếu nhập, **Then** bị từ chối dù dùng cách nào ngoài giao diện.
2. **Given** hệ thống đã có vai trò và quyền tuỳ chỉnh trước đó, **When** triển khai tính năng, **Then** vai trò/quyền hiện có không bị xoá hoặc thay đổi; chỉ bổ sung quyền mới và vai trò mới.

---

### User Story 9 - Song ngữ vi/en (Priority: P2)

Người dùng chuyển ngôn ngữ ở cả hai app; lựa chọn được ghi nhớ theo tài khoản; mọi nhãn, thông báo lỗi, trạng thái, lý do điều chỉnh, phương thức thanh toán hiển thị theo ngôn ngữ đã chọn; dữ liệu nghiệp vụ (tên sản phẩm, ghi chú) không bị nhân bản theo ngôn ngữ.

**Independent Test**: Chuyển sang English, thực hiện bán vượt tồn → lỗi hiện tiếng Anh; trạng thái đơn hiện "Confirmed"; đăng nhập lại vẫn English.

**Acceptance Scenarios**:

1. **Given** ngôn ngữ English, **When** xem danh sách đơn, **Then** trạng thái và phương thức thanh toán hiện tiếng Anh, dữ liệu lưu vẫn là mã trung lập (không phụ thuộc ngôn ngữ).
2. **Given** tên sản phẩm, **When** chuyển ngôn ngữ, **Then** tên và mô tả sản phẩm giữ nguyên như đã nhập (dữ liệu nghiệp vụ một ngôn ngữ); chỉ nhãn giao diện đổi ngôn ngữ.

### Edge Cases

- Hai người cùng sửa một phiếu nháp: người lưu sau được cảnh báo dữ liệu đã thay đổi, không ghi đè im lặng.
- Bán sản phẩm vừa bị ngừng kinh doanh khi đang ở trong giỏ: chốt đơn bị từ chối, chỉ rõ dòng.
- Giá bán trên đơn khác giá niêm yết: được phép (quyền sửa giá), đơn lưu giá thực tế.
- Chiết khấu cả dòng lẫn tổng đơn làm tổng tiền âm: bị từ chối.
- Huỷ đơn bán sau khi sản phẩm đã ngừng kinh doanh: vẫn cộng lại tồn kho.
- Sản phẩm tồn 0 có giá vốn bình quân: giữ giá vốn bình quân gần nhất; lần nhập tiếp theo tính lại từ đầu theo lượng mới.
- Số lượng thập phân (kg, m): cho phép tối đa 3 chữ số thập phân; số tiền làm tròn tới đồng.
- Mã phiếu/đơn trùng khi nhiều người tạo cùng lúc: hệ thống luôn sinh mã duy nhất.
- Ảnh đã xoá khỏi sản phẩm nhưng kho lưu trữ tạm lỗi: bản ghi vẫn bị gỡ, file được dọn lại sau.
- Kho lưu trữ ảnh không khả dụng: nghiệp vụ bán/nhập vẫn chạy, chỉ ảnh không hiển thị.
- Báo cáo khoảng ngày rất dài (nhiều năm): giới hạn khoảng tối đa và báo rõ khi vượt.
- Người dùng bị khoá hoặc mất quyền giữa chừng: thao tác tiếp theo bị từ chối ngay.

## Requirements *(mandatory)*

### Functional Requirements

**Danh mục & sản phẩm**

- **FR-001**: Hệ thống PHẢI cho phép tạo, sửa, xem, ngừng sử dụng danh mục (một cấp); không cho xoá danh mục đang có sản phẩm.
- **FR-002**: Hệ thống PHẢI cho phép tạo, sửa, xem, ngừng kinh doanh/kinh doanh lại sản phẩm với: SKU (duy nhất, không phân biệt hoa thường), tên, mô tả, danh mục, đơn vị tính, giá nhập tham khảo, giá bán, tồn tối thiểu, trạng thái.
- **FR-003**: Hệ thống PHẢI tìm sản phẩm theo tên hoặc SKU, lọc theo danh mục, trạng thái kinh doanh, trạng thái tồn; sắp xếp theo tên, SKU, giá bán, tồn, ngày tạo; phân trang có tổng số.
- **FR-004**: Hệ thống KHÔNG được xoá vĩnh viễn sản phẩm đã phát sinh giao dịch; sản phẩm chưa phát sinh giao dịch có thể xoá.
- **FR-005**: Tồn kho của sản phẩm KHÔNG được sửa trực tiếp trong form sản phẩm.

**Ảnh sản phẩm**

- **FR-006**: Hệ thống PHẢI cho phép tải nhiều ảnh (tối đa 10 ảnh/sản phẩm, mỗi ảnh tối đa 5 MB, định dạng JPEG/PNG/WebP), kiểm tra định dạng và dung lượng cả trước và sau khi tải.
- **FR-007**: Ảnh PHẢI được tải trực tiếp lên kho lưu trữ qua đường dẫn tải lên có thời hạn do hệ thống cấp; thông tin đăng nhập kho lưu trữ KHÔNG bao giờ được gửi tới trình duyệt.
- **FR-008**: Ảnh PHẢI lưu ở chế độ riêng tư; hiển thị qua đường dẫn xem có thời hạn, chỉ cấp cho người có quyền xem sản phẩm.
- **FR-009**: Hệ thống PHẢI cho phép chọn ảnh chính, sắp xếp thứ tự, thay ảnh, xoá ảnh; luôn có đúng một ảnh chính khi sản phẩm có ảnh.
- **FR-010**: Hệ thống PHẢI dọn file tải lên dở dang hoặc không còn gắn với sản phẩm (định kỳ, tối thiểu mỗi ngày), và xoá file khi ảnh bị xoá/thay.

**Nhà cung cấp**

- **FR-011**: Hệ thống PHẢI quản lý nhà cung cấp (tên, người liên hệ, điện thoại, email, địa chỉ, ghi chú, trạng thái), tìm theo tên/điện thoại/email, lọc theo trạng thái; không xoá nhà cung cấp đã có phiếu nhập (chỉ ngừng hợp tác).
- **FR-012**: Hệ thống PHẢI hiện lịch sử phiếu nhập và tổng giá trị nhập đã xác nhận của từng nhà cung cấp.

**Nhập hàng**

- **FR-013**: Hệ thống PHẢI cho phép lập phiếu nhập gồm: mã phiếu (tự sinh, duy nhất), nhà cung cấp đang hợp tác, ngày nhập, các dòng (sản phẩm, số lượng > 0, đơn giá nhập ≥ 0, chiết khấu dòng), chiết khấu phiếu, tổng tiền, ghi chú, trạng thái Nháp / Đã xác nhận / Đã huỷ.
- **FR-014**: Chỉ phiếu Nháp được sửa. Xác nhận phiếu PHẢI: cộng tồn, tính lại giá vốn bình quân gia quyền, ghi một biến động cho mỗi dòng, chuyển trạng thái — tất cả thành công hoặc không có gì thay đổi.
- **FR-015**: Xác nhận PHẢI có hiệu lực đúng một lần kể cả khi có yêu cầu trùng hoặc đồng thời.
- **FR-016**: Phiếu Nháp có thể huỷ mà không ảnh hưởng tồn. Phiếu đã xác nhận KHÔNG được huỷ hay sửa; sai sót được xử lý bằng phiếu điều chỉnh tồn.
- **FR-017**: Đơn giá nhập đã xác nhận PHẢI được giữ nguyên trên phiếu, không bị ảnh hưởng khi giá trên sản phẩm thay đổi.

**Bán hàng**

- **FR-018**: Hệ thống PHẢI cho phép lập đơn bán gồm: mã đơn (tự sinh, duy nhất), ngày bán, tên và SĐT khách (không bắt buộc), các dòng (sản phẩm đang kinh doanh, số lượng > 0, đơn giá bán, chiết khấu dòng), chiết khấu đơn, tổng tiền, phương thức thanh toán (Tiền mặt / Chuyển khoản / Khác), trạng thái thanh toán (Chưa thanh toán / Đã thanh toán — thanh toán toàn bộ một lần), ghi chú, trạng thái đơn Nháp / Đã xác nhận / Đã huỷ.
- **FR-019**: Đơn Nháp không ảnh hưởng tồn. Chốt (xác nhận) đơn PHẢI: kiểm tra đủ tồn cho mọi dòng, trừ tồn, ghi giá bán thực tế và giá vốn bình quân tại thời điểm chốt cho từng dòng, ghi biến động — tất cả thành công hoặc không có gì thay đổi.
- **FR-020**: Hệ thống PHẢI từ chối chốt đơn khi thiếu hàng, chỉ rõ từng sản phẩm thiếu và số lượng còn; tồn kho KHÔNG bao giờ âm kể cả khi nhiều đơn chốt đồng thời.
- **FR-021**: Chốt đơn PHẢI có hiệu lực đúng một lần.
- **FR-022**: Huỷ đơn đã xác nhận PHẢI cộng lại tồn theo đúng số lượng và giá vốn đã ghi trên đơn, ghi biến động huỷ, loại đơn khỏi doanh thu/lợi nhuận. Huỷ đơn Nháp không ảnh hưởng tồn.
- **FR-023**: Màn hình bán hàng PHẢI cho tìm sản phẩm theo tên/SKU, hiện ảnh chính, giá bán, tồn hiện tại; giỏ hàng cho chỉnh số lượng, giá (nếu có quyền), chiết khấu; tạo đơn và chốt trong một bước, hoặc lưu nháp.
- **FR-024**: Hệ thống PHẢI có lịch sử đơn bán (lọc theo khoảng ngày, trạng thái đơn, trạng thái thanh toán, phương thức, người tạo; tìm theo mã đơn, SĐT khách) và trang chi tiết đơn.

**Tồn kho**

- **FR-025**: Hệ thống PHẢI duy trì tồn hiện tại cho từng sản phẩm (một kho) và sổ biến động đầy đủ: loại (nhập, bán, huỷ bán, điều chỉnh), số lượng thay đổi, tồn sau biến động, giá vốn, chứng từ liên quan, người thực hiện, thời điểm.
- **FR-026**: Tổng các biến động của mỗi sản phẩm PHẢI luôn bằng tồn hiện tại; mọi thay đổi tồn chỉ đi qua nhập, bán, huỷ hoặc điều chỉnh.
- **FR-027**: Hệ thống PHẢI cho phép điều chỉnh tồn (một hoặc nhiều sản phẩm) với lý do bắt buộc (Hư hỏng, Mất, Kiểm kê, Khác) và ghi chú (bắt buộc khi lý do là Khác); với Kiểm kê, người dùng nhập số đếm thực tế và hệ thống tự tính chênh lệch.
- **FR-028**: Hệ thống PHẢI hiển thị cảnh báo sắp hết (0 < tồn ≤ tồn tối thiểu) và hết hàng (tồn = 0) trong trang tồn kho và dashboard.
- **FR-029**: Hệ thống PHẢI cho tìm, lọc tồn kho theo tên/SKU, danh mục, trạng thái tồn; xem lịch sử nhập, xuất, biến động theo sản phẩm và khoảng ngày.

**Dashboard & báo cáo**

- **FR-030**: Dashboard PHẢI hiện: tổng sản phẩm đang kinh doanh, tổng nhà cung cấp đang hợp tác, tổng số lượng tồn, giá trị tồn (tồn × giá vốn bình quân), doanh thu và số đơn hôm nay, giá trị nhập hôm nay, danh sách sắp hết và hết hàng.
- **FR-031**: Hệ thống PHẢI có báo cáo: doanh thu theo ngày, theo tháng, theo khoảng ngày; bán theo sản phẩm; sản phẩm bán chạy (theo số lượng và theo doanh thu); lịch sử nhập; tồn kho; biến động tồn; lợi nhuận gộp ước tính — lọc theo khoảng ngày, sản phẩm, danh mục, nhà cung cấp (khi áp dụng).
- **FR-032**: Lợi nhuận gộp PHẢI = doanh thu thuần (sau chiết khấu) − giá vốn hàng bán, với giá vốn lấy từ giá vốn đã lưu trên từng dòng đơn đã xác nhận (bình quân gia quyền tại thời điểm chốt); chỉ tính đơn Đã xác nhận, loại đơn Đã huỷ; báo cáo hiển thị tách biệt ba chỉ tiêu.
- **FR-033**: Mốc "hôm nay", "ngày", "tháng" PHẢI tính theo giờ Việt Nam (UTC+7).

**Phân quyền**

- **FR-034**: Hệ thống PHẢI bổ sung quyền cho các nhóm: Danh mục/Sản phẩm, Nhà cung cấp, Nhập hàng, Bán hàng, Tồn kho, Báo cáo/Dashboard, tách riêng các thao tác nhạy cảm (xác nhận, huỷ đã xác nhận, xem giá vốn/lợi nhuận, sửa giá bán trên đơn, xem đơn của người khác).
- **FR-035**: Hệ thống PHẢI tạo sẵn vai trò Manager và Staff với bộ quyền mặc định theo ma trận dưới; vai trò Administrator hiện có đóng vai ADMIN và nhận đủ quyền mới. Vai trò, quyền và gán vai trò hiện có KHÔNG bị thay đổi.
- **FR-036**: Mọi kiểm tra quyền PHẢI thực hiện ở phía hệ thống, không chỉ ẩn trên giao diện.

**Đa ngôn ngữ**

- **FR-037**: Mọi nhãn, thông báo, trạng thái, lý do, phương thức thanh toán PHẢI có bản vi và en ở cả hai app; giá trị lưu trữ là mã trung lập ngôn ngữ.
- **FR-038**: Lỗi nghiệp vụ PHẢI có mã ổn định kèm tham số (ví dụ sản phẩm thiếu, số lượng còn) để giao diện hiển thị theo ngôn ngữ đang chọn.
- **FR-039**: Tiền tệ mặc định VND (không phần lẻ khi hiển thị); ngày, số định dạng theo locale đang chọn.

**Truy vết & tài liệu**

- **FR-040**: Mọi chứng từ (phiếu nhập, đơn bán, điều chỉnh) PHẢI lưu người tạo, người xác nhận/huỷ và thời điểm tương ứng.
- **FR-041**: Mọi thao tác mới PHẢI được mô tả trong tài liệu API; tài liệu triển khai PHẢI bổ sung hướng dẫn cài đặt kho lưu trữ ảnh.

### Ma trận quyền mặc định

| Nhóm chức năng | Admin | Manager | Staff |
| --- | --- | --- | --- |
| Danh mục, sản phẩm: xem | ✓ | ✓ | ✓ |
| Danh mục, sản phẩm, ảnh: tạo/sửa/ngừng | ✓ | ✓ | — |
| Xem giá nhập, giá vốn | ✓ | ✓ | — |
| Nhà cung cấp: xem | ✓ | ✓ | — |
| Nhà cung cấp: tạo/sửa/ngừng | ✓ | ✓ | — |
| Phiếu nhập: xem, tạo/sửa nháp, huỷ nháp | ✓ | ✓ | — |
| Phiếu nhập: xác nhận | ✓ | ✓ | — |
| Đơn bán: tạo, lưu nháp, chốt, ghi nhận thanh toán | ✓ | ✓ | ✓ |
| Đơn bán: sửa đơn giá khác giá niêm yết | ✓ | ✓ | — |
| Đơn bán: xem đơn của mình | ✓ | ✓ | ✓ |
| Đơn bán: xem đơn của mọi người | ✓ | ✓ | — |
| Đơn bán: huỷ đơn đã xác nhận | ✓ | ✓ | — |
| Tồn kho, sổ biến động: xem | ✓ | ✓ | ✓ (chỉ số lượng) |
| Điều chỉnh tồn | ✓ | ✓ | — |
| Dashboard bán hàng, báo cáo, lợi nhuận | ✓ | ✓ | — |
| Người dùng, vai trò, quyền, cài đặt | ✓ | — | — |
| Vào app quản trị | ✓ | ✓ | — |
| Dùng màn hình bán hàng (app bán hàng) | ✓ | ✓ | ✓ |

### Luồng nghiệp vụ chính

1. **Nhập hàng**: Tạo phiếu (Nháp) → thêm dòng, sửa → Xác nhận (cộng tồn, tính lại giá vốn bình quân, ghi sổ) → Đã xác nhận (khoá, không huỷ/sửa). Nhánh: Nháp → Huỷ.
2. **Bán hàng**: Tìm sản phẩm → giỏ hàng → (Lưu nháp) → Chốt đơn (kiểm tra tồn, trừ tồn, chốt giá bán + giá vốn, ghi sổ; chọn phương thức và Đã thanh toán / Chưa thanh toán) → Đã xác nhận → (Ghi nhận thanh toán sau, một lần, toàn bộ) → (Huỷ: cộng lại tồn, ghi sổ) → Đã huỷ.
3. **Điều chỉnh tồn**: Chọn sản phẩm → nhập chênh lệch hoặc số đếm thực tế → chọn lý do → Lưu (kiểm tra không âm, ghi sổ).
4. **Ảnh sản phẩm**: Chọn file → hệ thống kiểm tra loại/dung lượng, cấp đường dẫn tải lên có hạn → trình duyệt tải trực tiếp → báo hoàn tất → hệ thống kiểm tra file thực tế, gắn vào sản phẩm (file không hợp lệ hoặc không hoàn tất bị dọn).
5. **Giá vốn bình quân**: Khi xác nhận nhập: giá vốn mới = (tồn hiện tại × giá vốn hiện tại + SL nhập × đơn giá nhập thuần) ÷ (tồn hiện tại + SL nhập). Bán và điều chỉnh không đổi giá vốn bình quân.

### Key Entities *(include if feature involves data)*

- **Danh mục**: tên, mô tả, trạng thái; có nhiều sản phẩm.
- **Sản phẩm**: SKU, tên, mô tả, danh mục, đơn vị tính, giá nhập tham khảo, giá bán niêm yết, tồn tối thiểu, trạng thái, tồn hiện tại, giá vốn bình quân hiện tại; có nhiều ảnh.
- **Ảnh sản phẩm**: khoá đối tượng trong kho lưu trữ, loại file, dung lượng, kích thước, thứ tự, cờ ảnh chính, trạng thái tải (đang tải / hoàn tất).
- **Nhà cung cấp**: tên, người liên hệ, điện thoại, email, địa chỉ, ghi chú, trạng thái; có nhiều phiếu nhập.
- **Phiếu nhập** và **Dòng phiếu nhập**: mã, nhà cung cấp, ngày, trạng thái, chiết khấu, tổng, ghi chú, người tạo/xác nhận/huỷ; dòng: sản phẩm, số lượng, đơn giá, chiết khấu, thành tiền.
- **Đơn bán** và **Dòng đơn bán**: mã, ngày, khách (tên, SĐT), trạng thái, phương thức thanh toán, trạng thái thanh toán, chiết khấu, tổng, ghi chú, người tạo/chốt/huỷ; dòng: sản phẩm, snapshot tên/SKU, số lượng, đơn giá bán thực tế, chiết khấu, giá vốn tại thời điểm chốt.
- **Phiếu điều chỉnh tồn** và **Dòng điều chỉnh**: lý do, ghi chú, người thực hiện, thời điểm; dòng: sản phẩm, tồn trước, chênh lệch, tồn sau.
- **Biến động tồn kho (sổ cái)**: sản phẩm, loại, số lượng thay đổi (±), tồn sau, giá vốn đơn vị, chứng từ nguồn, người thực hiện, thời điểm. Chỉ thêm, không sửa/xoá.
- **Vai trò / quyền**: dùng cơ chế hiện có, bổ sung quyền mới và vai trò Manager, Staff.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Nhân viên hoàn tất một đơn bán 5 dòng hàng (tìm, thêm giỏ, thanh toán, chốt) trong dưới 60 giây.
- **SC-002**: Tìm sản phẩm theo tên/SKU trả kết quả trong dưới 1 giây với danh mục 10.000 sản phẩm.
- **SC-003**: Trong kiểm thử 50 đơn chốt đồng thời cho cùng một sản phẩm tồn 10, đúng 10 đơn thành công, tồn kết thúc bằng 0, không có tồn âm.
- **SC-004**: Với mọi sản phẩm, tổng sổ biến động bằng tồn hiện tại (kiểm tra đối soát 100% khớp).
- **SC-005**: Báo cáo lợi nhuận trên bộ dữ liệu mẫu khớp 100% với kết quả tính tay (doanh thu, giá vốn, lợi nhuận gộp).
- **SC-006**: 100% chuỗi hiển thị của tính năng có bản vi và en; không có chuỗi hiển thị bị viết cứng.
- **SC-007**: Dashboard và báo cáo trong khoảng 1 năm dữ liệu (≈100.000 dòng đơn) hiển thị trong dưới 3 giây.
- **SC-008**: Không thao tác nào của Staff vượt ma trận quyền thành công khi kiểm thử trực tiếp (không qua giao diện).
- **SC-009**: Không còn file ảnh mồ côi quá 24 giờ sau khi bị bỏ dở hoặc xoá.
- **SC-010**: Người dùng tự đăng ký hiện tại không nhận thấy thay đổi nào (không thấy menu/không gọi được chức năng bán hàng).

## Assumptions

- Một cửa hàng, một kho; không đa chi nhánh, không đa tiền tệ, không thuế, không công nợ phức tạp, không tích hợp sàn TMĐT, không khách hàng thân thiết (theo phạm vi loại trừ).
- App quản trị giữ vai trò quản trị và bổ sung các màn hình quản lý; app người dùng giữ chức năng tự phục vụ hiện có và bổ sung màn hình bán hàng chỉ dành cho tài khoản có quyền bán hàng (không tách app mới).
- Vai trò `Administrator` hiện có = ADMIN; tạo thêm vai trò hệ thống "Manager" và "Staff"; vai trò `User` mặc định không có quyền nghiệp vụ.
- Khách hàng không phải là thực thể quản lý riêng; chỉ lưu tên/SĐT trên đơn.
- (Chốt Q1) Phiếu nhập đã xác nhận là bất biến; không huỷ, không sửa — sai sót sửa bằng điều chỉnh tồn.
- (Chốt Q2) Trạng thái thanh toán chỉ gồm Chưa thanh toán / Đã thanh toán; không có thanh toán một phần hay theo dõi công nợ. Huỷ đơn đã thanh toán không tự ghi nhận hoàn tiền (hoàn tiền xử lý ngoài hệ thống, ghi trong ghi chú).
- (Chốt Q3) Tên, mô tả sản phẩm và tên danh mục là dữ liệu một ngôn ngữ (nhập sao hiển thị vậy); chỉ giao diện là song ngữ.
- Danh mục một cấp; đơn vị tính là văn bản tự do ngắn (vd. "cái", "kg").
- Số lượng cho phép tối đa 3 chữ số thập phân; tiền lưu chính xác tới 2 chữ số thập phân, hiển thị VND làm tròn tới đồng.
- Chiết khấu dòng và chiết khấu đơn là số tiền (giao diện có thể hỗ trợ nhập phần trăm rồi quy đổi).
- Giá bán trên đơn mặc định bằng giá niêm yết; chỉ người có quyền mới sửa được.
- Mã chứng từ tự sinh dạng tiền tố + ngày + số thứ tự (vd. `PN-20261119-0001`, `DH-20261119-0001`).
- Cảnh báo sắp hết/hết hàng hiển thị trong ứng dụng; không gửi email/thông báo đẩy trong MVP.
- Báo cáo xem trên màn hình; xuất file (Excel/PDF) ngoài phạm vi MVP. Khoảng ngày báo cáo tối đa 366 ngày.
- Giá nhập trên sản phẩm chỉ là giá tham khảo để điền sẵn phiếu nhập; giá vốn thực dùng bình quân gia quyền.
- Repo hiện không dùng Docker: kho lưu trữ ảnh được cài đặt và tài liệu hoá theo cùng cách triển khai hiện có (dịch vụ chạy trên máy chủ); bổ sung cấu hình kết nối ở phía máy chủ.
- Thiết kế cơ sở dữ liệu, đặc tả API, luồng tải ảnh chi tiết và chiến lược i18n kỹ thuật sẽ được trình bày ở bước lập kế hoạch (plan), sau khi đặc tả này được duyệt; chưa triển khai code trước khi duyệt.
