-- CreateEnum
CREATE TYPE "PageKind" AS ENUM ('PAGE', 'SERVICE');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERNSHIP', 'CONTRACT');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'REVIEWING', 'INTERVIEW', 'HIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "static_pages" ADD COLUMN     "cover_image_id" UUID,
ADD COLUMN     "in_menu" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "PageKind" NOT NULL DEFAULT 'PAGE',
ADD COLUMN     "link_href" TEXT,
ADD COLUMN     "sort_order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "summary" TEXT;

-- CreateTable
CREATE TABLE "job_postings" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'FULL_TIME',
    "salary_min_vnd" BIGINT,
    "salary_max_vnd" BIGINT,
    "salary_note" TEXT,
    "openings" INTEGER,
    "deadline" DATE,
    "summary" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT NOT NULL,
    "benefits" TEXT NOT NULL,
    "status" "PublishStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "seo_title" TEXT,
    "seo_description" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_applications" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "message" TEXT,
    "cv_data" BYTEA,
    "cv_name" TEXT,
    "cv_mime" TEXT,
    "cv_size" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "notes" TEXT,
    "consent_at" TIMESTAMP(3) NOT NULL,
    "ip_hash" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_postings_slug_key" ON "job_postings"("slug");

-- CreateIndex
CREATE INDEX "job_postings_status_deleted_at_idx" ON "job_postings"("status", "deleted_at");

-- CreateIndex
CREATE INDEX "job_applications_status_created_at_idx" ON "job_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "job_applications_job_id_idx" ON "job_applications"("job_id");

-- CreateIndex
CREATE INDEX "static_pages_kind_status_sort_order_idx" ON "static_pages"("kind", "status", "sort_order");

-- AddForeignKey
ALTER TABLE "static_pages" ADD CONSTRAINT "static_pages_cover_image_id_fkey" FOREIGN KEY ("cover_image_id") REFERENCES "media_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "job_postings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Lĩnh vực hoạt động" moved from code (FE-DVG src/data) into the CMS.
INSERT INTO "static_pages" ("id", "path", "kind", "title", "eyebrow", "intro", "summary", "sections", "sort_order", "in_menu", "link_href", "status", "published_at", "updated_at") VALUES
  (gen_random_uuid(), 'dich-vu/quan-ly-bat-dong-san', 'SERVICE', 'Quản lý vận hành bất động sản', 'LĨNH VỰC HOẠT ĐỘNG', 'Đồng hành từ tiếp nhận căn hộ, theo dõi vận hành đến báo cáo định kỳ, với quy trình rõ ràng và dễ theo dõi.', 'Tiếp nhận, vận hành và báo cáo định kỳ', '[{"heading": "Phương án phù hợp với nhu cầu thực tế.", "body": "Đồng hành từ tiếp nhận căn hộ, theo dõi vận hành đến báo cáo định kỳ, với quy trình rõ ràng và dễ theo dõi. Mỗi phương án bắt đầu bằng việc hiểu mục tiêu của bạn, các đặc điểm của tài sản và những nguồn lực sẵn có."}, {"heading": "Phạm vi phối hợp", "body": "Tiếp nhận thông tin và xác định các ưu tiên.\nKhảo sát hiện trạng, làm rõ phạm vi và đầu mối công việc.\nĐề xuất kế hoạch, thời gian và cơ chế cập nhật.\nTheo dõi phản hồi và cùng điều chỉnh khi cần thiết."}, {"heading": "Minh bạch trước khi bắt đầu", "body": "Các chi phí và trách nhiệm cần được trao đổi theo từng trường hợp. Nội dung này là mô hình dịch vụ minh họa, không phải báo giá hoặc cam kết hiệu quả tài chính."}]'::jsonb, 10, true, NULL, 'PUBLISHED', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'dich-vu/khai-thac-cho-thue', 'SERVICE', 'Khai thác căn hộ cho thuê', 'LĨNH VỰC HOẠT ĐỘNG', 'Kết nối căn hộ với nhu cầu phù hợp, hỗ trợ giới thiệu không gian, đón tiếp và chăm sóc người thuê.', 'Tìm khách thuê phù hợp, chăm sóc người thuê', '[{"heading": "Phương án phù hợp với nhu cầu thực tế.", "body": "Kết nối căn hộ với nhu cầu phù hợp, hỗ trợ giới thiệu không gian, đón tiếp và chăm sóc người thuê. Mỗi phương án bắt đầu bằng việc hiểu mục tiêu của bạn, các đặc điểm của tài sản và những nguồn lực sẵn có."}, {"heading": "Phạm vi phối hợp", "body": "Tiếp nhận thông tin và xác định các ưu tiên.\nKhảo sát hiện trạng, làm rõ phạm vi và đầu mối công việc.\nĐề xuất kế hoạch, thời gian và cơ chế cập nhật.\nTheo dõi phản hồi và cùng điều chỉnh khi cần thiết."}, {"heading": "Minh bạch trước khi bắt đầu", "body": "Các chi phí và trách nhiệm cần được trao đổi theo từng trường hợp. Nội dung này là mô hình dịch vụ minh họa, không phải báo giá hoặc cam kết hiệu quả tài chính."}]'::jsonb, 20, true, NULL, 'PUBLISHED', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'dich-vu/hop-tac-chu-so-huu', 'SERVICE', 'Hợp tác cùng chủ sở hữu', 'LĨNH VỰC HOẠT ĐỘNG', 'Lắng nghe mục tiêu của chủ sở hữu để xây dựng phương án hợp tác phù hợp với từng tài sản.', 'Ký gửi căn hộ để Đất Vàng khai thác', '[{"heading": "Phương án phù hợp với nhu cầu thực tế.", "body": "Lắng nghe mục tiêu của chủ sở hữu để xây dựng phương án hợp tác phù hợp với từng tài sản. Mỗi phương án bắt đầu bằng việc hiểu mục tiêu của bạn, các đặc điểm của tài sản và những nguồn lực sẵn có."}, {"heading": "Phạm vi phối hợp", "body": "Tiếp nhận thông tin và xác định các ưu tiên.\nKhảo sát hiện trạng, làm rõ phạm vi và đầu mối công việc.\nĐề xuất kế hoạch, thời gian và cơ chế cập nhật.\nTheo dõi phản hồi và cùng điều chỉnh khi cần thiết."}, {"heading": "Minh bạch trước khi bắt đầu", "body": "Các chi phí và trách nhiệm cần được trao đổi theo từng trường hợp. Nội dung này là mô hình dịch vụ minh họa, không phải báo giá hoặc cam kết hiệu quả tài chính."}]'::jsonb, 30, true, '/hop-tac-chu-so-huu', 'PUBLISHED', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'dich-vu/tu-van-dau-tu', 'SERVICE', 'Tư vấn đầu tư', 'LĨNH VỰC HOẠT ĐỘNG', 'Cùng xem xét mục tiêu, ngân sách và các yếu tố thị trường trước mỗi quyết định dài hạn.', 'Mục tiêu, ngân sách và thị trường', '[{"heading": "Phương án phù hợp với nhu cầu thực tế.", "body": "Cùng xem xét mục tiêu, ngân sách và các yếu tố thị trường trước mỗi quyết định dài hạn. Mỗi phương án bắt đầu bằng việc hiểu mục tiêu của bạn, các đặc điểm của tài sản và những nguồn lực sẵn có."}, {"heading": "Phạm vi phối hợp", "body": "Tiếp nhận thông tin và xác định các ưu tiên.\nKhảo sát hiện trạng, làm rõ phạm vi và đầu mối công việc.\nĐề xuất kế hoạch, thời gian và cơ chế cập nhật.\nTheo dõi phản hồi và cùng điều chỉnh khi cần thiết."}, {"heading": "Minh bạch trước khi bắt đầu", "body": "Các chi phí và trách nhiệm cần được trao đổi theo từng trường hợp. Nội dung này là mô hình dịch vụ minh họa, không phải báo giá hoặc cam kết hiệu quả tài chính."}]'::jsonb, 40, true, NULL, 'PUBLISHED', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'dich-vu/toi-uu-khong-gian', 'SERVICE', 'Tối ưu không gian sống', 'LĨNH VỰC HOẠT ĐỘNG', 'Gợi ý bố trí nội thất, ánh sáng và công năng để mỗi mét vuông mang lại giá trị sử dụng.', 'Bố trí nội thất, ánh sáng và công năng', '[{"heading": "Phương án phù hợp với nhu cầu thực tế.", "body": "Gợi ý bố trí nội thất, ánh sáng và công năng để mỗi mét vuông mang lại giá trị sử dụng. Mỗi phương án bắt đầu bằng việc hiểu mục tiêu của bạn, các đặc điểm của tài sản và những nguồn lực sẵn có."}, {"heading": "Phạm vi phối hợp", "body": "Tiếp nhận thông tin và xác định các ưu tiên.\nKhảo sát hiện trạng, làm rõ phạm vi và đầu mối công việc.\nĐề xuất kế hoạch, thời gian và cơ chế cập nhật.\nTheo dõi phản hồi và cùng điều chỉnh khi cần thiết."}, {"heading": "Minh bạch trước khi bắt đầu", "body": "Các chi phí và trách nhiệm cần được trao đổi theo từng trường hợp. Nội dung này là mô hình dịch vụ minh họa, không phải báo giá hoặc cam kết hiệu quả tài chính."}]'::jsonb, 50, false, NULL, 'PUBLISHED', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC'),
  (gen_random_uuid(), 'dich-vu/cham-soc-bao-tri', 'SERVICE', 'Chăm sóc và bảo trì căn hộ', 'LĨNH VỰC HOẠT ĐỘNG', 'Lên lịch kiểm tra, ghi nhận hiện trạng và phối hợp bảo trì để duy trì trải nghiệm sống.', 'Kiểm tra định kỳ và phối hợp bảo trì', '[{"heading": "Phương án phù hợp với nhu cầu thực tế.", "body": "Lên lịch kiểm tra, ghi nhận hiện trạng và phối hợp bảo trì để duy trì trải nghiệm sống. Mỗi phương án bắt đầu bằng việc hiểu mục tiêu của bạn, các đặc điểm của tài sản và những nguồn lực sẵn có."}, {"heading": "Phạm vi phối hợp", "body": "Tiếp nhận thông tin và xác định các ưu tiên.\nKhảo sát hiện trạng, làm rõ phạm vi và đầu mối công việc.\nĐề xuất kế hoạch, thời gian và cơ chế cập nhật.\nTheo dõi phản hồi và cùng điều chỉnh khi cần thiết."}, {"heading": "Minh bạch trước khi bắt đầu", "body": "Các chi phí và trách nhiệm cần được trao đổi theo từng trường hợp. Nội dung này là mô hình dịch vụ minh họa, không phải báo giá hoặc cam kết hiệu quả tài chính."}]'::jsonb, 60, false, NULL, 'PUBLISHED', now() AT TIME ZONE 'UTC', now() AT TIME ZONE 'UTC')
ON CONFLICT ("path") DO NOTHING;
