# Quyết định phạm vi vận hành trước cutover Phase 5

Đề xuất ngày16/11/2026. Candidate này đặt legacy-comments frozen=true để mở cửa sổ bảo trì khi merge/deploy; production hiện vẫn frozen=false. Chỉ merge candidate sau khi chốt phạm vi vận hành bên dưới. **Chưa được coi là chấp thuận rủi ro mới; chưa thực hiện freeze/source switch/bật writer.** Phê duyệt tiếp tục triển khai không tự biến giới hạn chưa kiểm chứng thành kết quả pass. [Runbook](production-cutover.md) yêu cầu xử lý hoặc chốt rõ các gate hosted/vận hành trước cửa sổ cutover.

## Phương án V1 miễn phí đề xuất

| Phạm vi | Đã có bằng chứng | Giới hạn cần chấp nhận khi ra mắt V1 |
| --- | --- | --- |
| Admission | DB chia sẻ budget giữa Edge workers/direct POST; direct SELECT, GET RPC và transaction override bị chặn; runtime staging/production đã kiểm tra | Không có WAF/gateway chống volumetric hoặc bảo đảm công bằng từng người dùng. Lưu lượng trước DB, Auth và các transaction thất bại vẫn có thể gây cạn quota/gián đoạn. Không cam kết công suất hay SLA từ con số budget. |
| Backup | Protected main-only encrypted recovery; logical restore/checksum/schema/public-private/owner parity đã pass. Artifact mới43881272412 có tuổi còn phù hợp tại checkpoint; run6 đã có owner offline decrypt/hash | Backup hiện là thao tác thủ công có duyệt. Nhắc08:00 không tạo backup. Owner chạy/duyệt ít nhất hằng ngày và trước thay đổi dữ liệu/schema; kiểm tra freshness trước bật writer. RPO24h là mục tiêu, không bảo đảm; quá hạn hoặc thất bại cần báo owner và xem xét freeze writer theo CAS hiện hữu. Không bỏ protection/kiểm tra quota. |
| Phục hồi | Application/Auth logical restore vào target local cô lập đã đo; key cũ được owner giữ offline và run6 đã chứng minh giải mã | Chưa diễn tập toàn bộ sang hosted project mới và cấu hình OAuth/provider/roles/password; RTO1h chưa chứng minh. Artifact mới chưa được owner giải mã offline. Storage đang tắt; ảnh/assets còn trong Git. |
| Giám sát | ChatGPT read-only hourly/08:00 đã được cấu hình; có quan sát một số lần thực thi; health/source/quota/log aggregates có contract | Lịch20:00 bắt đầu21:04:44; chưa chứng minh delivery cảnh báo thực. Không có giới hạn cứng về detection/delivery, không phải on-call24/7. Trong cutover phải quan sát trực tiếp; sau đó owner kiểm tra phản hồi và xử lý cảnh báo thủ công. |
| Quyền | JWT/direct-RPC/browser CI thật; staging DB claim-context rollback âm tính; OAuth owner production và chuyển VI/EN đã xác minh | Staging rollback không phải hai phiên signed-JWT HTTP thật. Không tạo tài khoản/nội dung giả trên production để nâng mức bằng chứng. |
| Hiệu năng | CI local và hosted smoke đã pass; giữ nguyên số đo staging full thất bại | Exception performance đã được owner chấp nhận riêng, không hỏi lại.575dropped/2transport outcomes vẫn là thất bại, nguyên nhân network chưa chứng minh; giữ ngưỡng2s, không chạy lại load hosted. |

Phương án này giữ giới hạn không phát sinh phí, không tạo proxy/dịch vụ mới, không hạ quyền bảo vệ, không sao chép Auth production sang staging. Chấp thuận phạm vi V1 là quyết định sản phẩm/vận hành; **không phải chứng minh các giới hạn trên đã được khắc phục**.

## Việc thực hiện sau khi chốt phạm vi

1. Phần chuẩn bị freeze đã merge trong PR37 tại4532990. Kiểm tra main/CI và độ mới backup; candidate tiếp theo chỉ bật legacy-comments frozen=true khi được merge/deploy, giữ comments-source Git0 và DB writer tắt.
2. Với bình luận trước: commit review riêng bật legacy-comments frozen=true, giữ Git0 và API writer tắt; deploy/kiểm tra thông báo, drain các job đã nhận trước boundary, giữ workflow của feature khác hoạt động.
3. Chụp lại main và đầy đủ live Issue/comments sau boundary; so sánh cả raw provenance, pending/public, danh tính và timestamp. Ghi rõ arrival/edit muộn; mọi delta cần kế hoạch đối chiếu riêng, không archive/import mù hoặc xóa receipt gốc.
4. Khi parity và các kiểm tra quyền còn hợp lệ, đổi DB qua CAS có audit sangAPI1/writer=false, merge/deploy marker frontend tương ứng, xác minh nguồn/epoch/routes/OAuth/public/pending. Sau đó chỉ bật một API writer; legacy comments vẫn frozen.
5. Xác minh bằng thao tác người dùng thật khi có nội dung thật cần gửi; không đăng nội dung kiểm thử. Lặp độc lập cho posts/media/requests, không bật đồng loạt. Sau API write không quay về Git cũ.
6. Chỉ kết luận Phase5 hoàn tất khi các cutover và kiểm chứng bắt buộc đã thực hiện, cùng quyết định phạm vi được ghi rõ. Mục chưa kiểm chứng vẫn ghi chưa kiểm chứng trong biên bản cuối.

Nếu cần chống volumetric tại ingress hoặc chứng minh đầy đủ RPO/RTO trước ra mắt, giữ writers tắt và hoàn thiện thiết kế/hosted recovery tương ứng trước cutover. Không tự tạo tài nguyên trả phí hoặc thay đổi hosting để đóng gate.
