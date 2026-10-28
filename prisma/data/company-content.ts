/**
 * Real content of the company pages and "Lĩnh vực hoạt động" (replaces the
 * demo texts). Used by fresh installs (import:legacy, reference data) and by
 * `npm run content:real`, which swaps it in only where demo text remains.
 * Editors keep refining these pages in Admin › Trang nội dung.
 */
export type Section = { heading: string; body: string };
export type CompanyPage = { path: string; eyebrow: string; title: string; intro: string; sections: Section[] };

const UPDATED = '28/10/2026';

export const COMPANY_PAGES: CompanyPage[] = [
  {
    path: 'gioi-thieu',
    eyebrow: 'CÂU CHUYỆN ĐẤT VÀNG',
    title: 'Kiến tạo giá trị. Gắn kết tương lai.',
    intro:
      'Đất Vàng Group quản lý, vận hành, cho thuê và mua bán căn hộ tại Đà Nẵng. Chúng tôi làm việc trực tiếp với chủ nhà tại The Monarchy, Sun Panoma, Sun Ponte Residence, Sam Tower, Hiyori Garden Tower và nhiều dự án khác, để khách thuê có căn hộ đúng như ảnh và chủ nhà yên tâm về tài sản của mình.',
    sections: [
      {
        heading: 'Bắt đầu từ một không gian phù hợp',
        body: 'Giá trị của một căn hộ không chỉ nằm ở vị trí hay diện tích, mà ở việc nó có thật sự phù hợp với cuộc sống của người ở hay không. Vì vậy chúng tôi luôn hỏi kỹ nhu cầu, ngân sách và thói quen sinh hoạt trước khi giới thiệu căn.',
      },
      {
        heading: 'Một đầu mối, theo suốt hành trình',
        body: 'Từ lúc xem căn, ký hợp đồng, bàn giao đến khi cần sửa chữa hay gia hạn, khách thuê và chủ nhà đều có một chuyên viên phụ trách riêng. Mọi trao đổi được ghi nhận rõ ràng, có hẹn và có phản hồi.',
      },
      {
        heading: 'Minh bạch là nền tảng',
        body: 'Ảnh thật, giá rõ ràng, chi phí và điều kiện được nói trước. Chúng tôi chỉ đề xuất phương án sau khi hai bên đã hiểu đầy đủ nhu cầu, phạm vi công việc và chi phí liên quan.',
      },
    ],
  },
  {
    path: 'gioi-thieu/tam-nhin-su-menh',
    eyebrow: 'TẦM NHÌN & SỨ MỆNH',
    title: 'Tầm nhìn dài hạn. Giá trị từ hôm nay.',
    intro:
      'Đất Vàng Group hướng tới trở thành đơn vị quản lý và khai thác căn hộ được tin cậy nhất Đà Nẵng: người thuê tìm được nơi ở ưng ý, chủ nhà có nguồn thu ổn định và tài sản được chăm sóc đúng cách.',
    sections: [
      {
        heading: 'Tầm nhìn',
        body: 'Trở thành người đồng hành lâu dài của chủ sở hữu và khách thuê tại Đà Nẵng, với hệ thống căn hộ được quản lý chuyên nghiệp, thông tin minh bạch và dịch vụ tận tâm.',
      },
      {
        heading: 'Sứ mệnh',
        body: 'Kết nối đúng căn hộ với đúng người, vận hành tài sản bằng quy trình rõ ràng, và giúp mỗi giao dịch thuê, mua hay ký gửi diễn ra nhanh, an toàn, đúng cam kết.',
      },
      {
        heading: 'Giá trị cốt lõi',
        body: '• Tận tâm: lắng nghe trước, tư vấn sau.\n• Minh bạch: ảnh thật, giá thật, chi phí nói trước.\n• Trách nhiệm: đã hẹn là làm, đã nhận là theo đến cùng.\n• Cầu tiến: luôn học hỏi từ phản hồi của khách hàng.',
      },
    ],
  },
  {
    path: 'gioi-thieu/doi-ngu',
    eyebrow: 'ĐỘI NGŨ',
    title: 'Con người phía sau những kết nối.',
    intro:
      'Đội ngũ Đất Vàng Group là những người am hiểu từng tòa nhà, từng khu vực ở Đà Nẵng. Mỗi nhóm phụ trách một phần việc rõ ràng, để khách hàng luôn biết cần liên hệ ai và nhận phản hồi trong ngày.',
    sections: [
      {
        heading: 'Nhóm tư vấn thuê & mua bán',
        body: 'Tiếp nhận nhu cầu, gửi danh sách căn phù hợp kèm ảnh thật, sắp xếp lịch xem căn và hỗ trợ đàm phán điều kiện thuê, mua.',
      },
      {
        heading: 'Nhóm vận hành căn hộ',
        body: 'Bàn giao, kiểm tra hiện trạng định kỳ, tiếp nhận yêu cầu sửa chữa và phối hợp với ban quản lý tòa nhà, thợ kỹ thuật để xử lý nhanh.',
      },
      {
        heading: 'Nhóm chăm sóc chủ sở hữu',
        body: 'Làm việc với chủ nhà ký gửi: định giá cho thuê, theo dõi hợp đồng, thu chi và báo cáo định kỳ về tình trạng căn hộ.',
      },
    ],
  },
  {
    path: 'gioi-thieu/doi-tac',
    eyebrow: 'KẾT NỐI ĐỐI TÁC',
    title: 'Cùng nhau tạo nên giá trị.',
    intro:
      'Đất Vàng Group hợp tác với chủ đầu tư, ban quản lý tòa nhà và các đơn vị kiến trúc, nội thất, vận hành tại Đà Nẵng. Chúng tôi luôn chào đón những đối tác cùng chung tiêu chuẩn về chất lượng và sự minh bạch.',
    sections: [
      {
        heading: 'Chủ đầu tư & ban quản lý tòa nhà',
        body: 'Phân phối, cho thuê và vận hành căn hộ tại dự án; phối hợp chặt chẽ với ban quản lý để đảm bảo nội quy, an ninh và chất lượng sống của cư dân.',
      },
      {
        heading: 'Kiến trúc & nội thất',
        body: 'Cải tạo, trang bị nội thất cho căn hộ trước khi đưa vào khai thác, cân bằng giữa thẩm mỹ, độ bền và ngân sách của chủ nhà.',
      },
      {
        heading: 'Vận hành & dịch vụ',
        body: 'Vệ sinh, bảo trì, sửa chữa điện nước và các dịch vụ hỗ trợ khách thuê, với đầu mối rõ ràng và thời gian xử lý được thống nhất trước.',
      },
    ],
  },
  {
    path: 'hop-tac-chu-so-huu',
    eyebrow: 'DÀNH CHO CHỦ SỞ HỮU',
    title: 'Tài sản của bạn. Sự đồng hành của chúng tôi.',
    intro:
      'Bạn có căn hộ tại Đà Nẵng muốn cho thuê, bán hoặc giao cho đơn vị chuyên nghiệp vận hành? Đất Vàng Group khảo sát miễn phí, đề xuất giá phù hợp thị trường và lo trọn từ tìm khách đến chăm sóc căn hộ.',
    sections: [
      {
        heading: 'Khảo sát và định giá',
        body: 'Chúng tôi đến xem căn, ghi nhận vị trí, hướng, nội thất và hiện trạng, rồi đề xuất mức giá thuê hoặc giá bán dựa trên các căn tương tự đang giao dịch.',
      },
      {
        heading: 'Thống nhất phạm vi rõ ràng',
        body: 'Hai bên thống nhất bằng văn bản các công việc: chụp ảnh, đăng tin, dẫn khách, ký hợp đồng, bàn giao, theo dõi bảo trì và báo cáo. Phí dịch vụ, thời hạn và trách nhiệm được ghi rõ trước khi bắt đầu.',
      },
      {
        heading: 'Theo dõi và báo cáo',
        body: 'Chủ nhà được cập nhật định kỳ về tình trạng căn hộ, khách thuê, các khoản thu chi và đề xuất cải thiện. Chúng tôi không hứa hẹn lợi nhuận hay tỷ lệ lấp đầy cố định; mọi con số đều dựa trên thực tế thị trường.',
      },
    ],
  },
  {
    path: 'lien-he',
    eyebrow: 'LIÊN HỆ',
    title: 'Mọi kết nối tốt đẹp bắt đầu từ lắng nghe.',
    intro:
      'Bạn cần thuê, mua, ký gửi căn hộ hay muốn hợp tác? Hãy gọi hotline, nhắn Zalo hoặc để lại thông tin, chuyên viên Đất Vàng Group sẽ liên hệ lại trong ngày làm việc.',
    sections: [
      {
        heading: 'Phản hồi trong bao lâu?',
        body: 'Yêu cầu gửi trong giờ làm việc được phản hồi trong ngày. Yêu cầu gửi ngoài giờ sẽ được liên hệ vào sáng hôm sau. Cần gấp, hãy gọi trực tiếp hotline.',
      },
      {
        heading: 'Nên chuẩn bị thông tin gì?',
        body: '• Thuê, mua: dự án hoặc khu vực mong muốn, số phòng ngủ, ngân sách và thời gian dự kiến dọn vào.\n• Ký gửi: dự án, mã căn, diện tích, nội thất hiện có và mức giá kỳ vọng.\n• Hợp tác: lĩnh vực, phạm vi và cách bạn muốn phối hợp.',
      },
      {
        heading: 'Thông tin của bạn được bảo vệ',
        body: 'Thông tin bạn gửi chỉ được dùng để tư vấn và liên hệ lại, không chia sẻ cho bên thứ ba vì mục đích quảng cáo. Xem chi tiết tại Chính sách bảo mật.',
      },
    ],
  },
  {
    path: 'tuyen-dung',
    eyebrow: 'CƠ HỘI NGHỀ NGHIỆP',
    title: 'Cùng xây dựng những trải nghiệm tốt hơn.',
    intro:
      'Đất Vàng Group đang mở rộng đội ngũ tại Đà Nẵng. Chúng tôi tìm những người yêu nghề bất động sản, giao tiếp tốt và muốn phát triển lâu dài trong môi trường làm việc chuyên nghiệp, thân thiện.',
    sections: [
      {
        heading: 'Môi trường làm việc',
        body: '• Thu nhập cạnh tranh, thưởng theo kết quả công việc.\n• Được đào tạo về dự án, quy trình và kỹ năng tư vấn.\n• Lộ trình thăng tiến rõ ràng, làm việc cùng đội ngũ trẻ, năng động.',
      },
      {
        heading: 'Quy trình ứng tuyển',
        body: 'Gửi hồ sơ qua biểu mẫu tại trang này. Bộ phận nhân sự xem xét và liên hệ hẹn phỏng vấn trong vòng 3–5 ngày làm việc nếu hồ sơ phù hợp.',
      },
      {
        heading: 'Chưa thấy vị trí phù hợp?',
        body: 'Bạn vẫn có thể gửi hồ sơ ứng tuyển chung. Chúng tôi lưu lại và liên hệ khi có vị trí phù hợp với kinh nghiệm của bạn.',
      },
    ],
  },
  {
    path: 'chinh-sach-bao-mat',
    eyebrow: 'CHÍNH SÁCH BẢO MẬT',
    title: 'Chính sách bảo mật thông tin',
    intro: `Đất Vàng Group tôn trọng và bảo vệ dữ liệu cá nhân của khách hàng theo quy định của pháp luật Việt Nam, trong đó có Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Chính sách này áp dụng cho website datvanggroup.vn. Cập nhật lần cuối: ${UPDATED}.`,
    sections: [
      {
        heading: 'Thông tin chúng tôi thu thập',
        body: '• Thông tin bạn tự cung cấp qua biểu mẫu: họ tên, số điện thoại, email, nhu cầu thuê, mua, ký gửi, ngân sách và nội dung trao đổi.\n• Hồ sơ ứng tuyển: thông tin cá nhân và tệp CV bạn tải lên.\n• Thông tin kỹ thuật khi truy cập: địa chỉ IP, loại trình duyệt, trang đã xem, nhằm bảo mật và cải thiện website.',
      },
      {
        heading: 'Mục đích sử dụng',
        body: '• Liên hệ lại, tư vấn và giới thiệu căn hộ theo nhu cầu bạn gửi.\n• Thực hiện các thỏa thuận thuê, mua, ký gửi khi bạn đồng ý.\n• Xét tuyển đối với hồ sơ ứng tuyển.\n• Thống kê lượt truy cập, đo lường hiệu quả quảng cáo và cải thiện trải nghiệm website.',
      },
      {
        heading: 'Lưu trữ và bảo vệ',
        body: 'Dữ liệu được lưu trên máy chủ của Đất Vàng Group và các nhà cung cấp hạ tầng (máy chủ, lưu trữ hình ảnh, mạng phân phối nội dung). Chỉ nhân viên được phân quyền mới xem được thông tin khách hàng. Yêu cầu tư vấn được lưu tối đa 24 tháng, hồ sơ ứng tuyển tối đa 12 tháng, trừ khi pháp luật yêu cầu khác.',
      },
      {
        heading: 'Chia sẻ thông tin',
        body: 'Chúng tôi không bán hoặc cho thuê dữ liệu cá nhân. Thông tin chỉ được chia sẻ với chủ sở hữu căn hộ hoặc đối tác liên quan khi cần để thực hiện giao dịch bạn yêu cầu, hoặc khi cơ quan nhà nước có thẩm quyền yêu cầu theo quy định pháp luật.',
      },
      {
        heading: 'Cookie và công cụ đo lường',
        body: 'Website dùng cookie để ghi nhớ ngôn ngữ, căn hộ đã lưu, căn hộ vừa xem và duy trì đăng nhập của nhân viên. Chúng tôi có thể dùng công cụ phân tích và quảng cáo (như Google Analytics, Google Ads, Meta) để đo lường lượt truy cập và hiệu quả quảng cáo. Bạn có thể tắt cookie trong cài đặt trình duyệt.',
      },
      {
        heading: 'Quyền của bạn',
        body: 'Bạn có quyền yêu cầu xem, chỉnh sửa, xóa dữ liệu cá nhân hoặc rút lại sự đồng ý bất cứ lúc nào. Hãy liên hệ qua hotline, Zalo hoặc email trên trang Liên hệ; chúng tôi xử lý yêu cầu trong vòng 72 giờ làm việc.',
      },
    ],
  },
  {
    path: 'dieu-khoan-su-dung',
    eyebrow: 'ĐIỀU KHOẢN SỬ DỤNG',
    title: 'Điều khoản sử dụng website',
    intro: `Khi truy cập và sử dụng website datvanggroup.vn, bạn đồng ý với các điều khoản dưới đây. Cập nhật lần cuối: ${UPDATED}.`,
    sections: [
      {
        heading: 'Thông tin căn hộ và giá',
        body: 'Thông tin, hình ảnh và giá căn hộ được cập nhật thường xuyên nhưng có thể thay đổi theo thị trường hoặc theo quyết định của chủ sở hữu. Tình trạng còn trống, giá thuê, giá bán và chi phí cuối cùng được xác nhận khi bạn liên hệ và xem căn trực tiếp.',
      },
      {
        heading: 'Giao dịch và hợp đồng',
        body: 'Nội dung trên website mang tính giới thiệu, không phải hợp đồng hay cam kết giao dịch. Mọi khoản đặt cọc, thanh toán và nghĩa vụ chỉ phát sinh khi các bên ký văn bản thỏa thuận. Vui lòng chỉ chuyển tiền theo hợp đồng và tài khoản được xác nhận chính thức.',
      },
      {
        heading: 'Trách nhiệm của người dùng',
        body: '• Cung cấp thông tin trung thực khi gửi yêu cầu.\n• Không sử dụng website cho mục đích gian lận, quấy rối hoặc gây hại cho hệ thống.\n• Không sao chép nội dung, hình ảnh của website cho mục đích thương mại khi chưa được cho phép.',
      },
      {
        heading: 'Quyền sở hữu nội dung',
        body: 'Thương hiệu, logo, hình ảnh và bài viết trên website thuộc quyền sở hữu của Đất Vàng Group hoặc đối tác đã cho phép sử dụng. Khi trích dẫn, vui lòng ghi rõ nguồn datvanggroup.vn.',
      },
      {
        heading: 'Giới hạn trách nhiệm',
        body: 'Bài viết thị trường và cẩm nang chỉ mang tính tham khảo, không thay thế tư vấn pháp lý, tài chính cho từng trường hợp cụ thể. Đất Vàng Group không chịu trách nhiệm với các quyết định đầu tư dựa hoàn toàn vào nội dung tham khảo này.',
      },
      {
        heading: 'Luật áp dụng',
        body: 'Điều khoản được điều chỉnh theo pháp luật Việt Nam. Mọi thắc mắc, góp ý xin liên hệ hotline hoặc email trên trang Liên hệ; tranh chấp (nếu có) ưu tiên giải quyết bằng thương lượng.',
      },
    ],
  },
];

/** "Lĩnh vực hoạt động" pages (dich-vu/<slug>): their own sections each. */
export const SERVICE_SECTIONS: Record<string, Section[]> = {
  'quan-ly-bat-dong-san': [
    {
      heading: 'Chúng tôi làm gì cho căn hộ của bạn',
      body: 'Đất Vàng Group nhận quản lý toàn bộ căn hộ thay chủ nhà: bàn giao cho khách thuê, theo dõi hợp đồng, thu tiền thuê, xử lý sự cố và báo cáo định kỳ. Chủ nhà ở xa hoặc bận rộn vẫn nắm được tình hình tài sản.',
    },
    {
      heading: 'Quy trình quản lý',
      body: '• Tiếp nhận căn hộ, lập biên bản hiện trạng và danh mục nội thất.\n• Thống nhất phạm vi, chi phí và cách báo cáo.\n• Kiểm tra định kỳ, xử lý yêu cầu của khách thuê.\n• Báo cáo thu chi và tình trạng căn hộ hằng tháng.',
    },
    {
      heading: 'Phù hợp với ai',
      body: 'Chủ nhà sở hữu một hoặc nhiều căn hộ tại Đà Nẵng, muốn có nguồn thu ổn định mà không phải trực tiếp lo việc vận hành hằng ngày.',
    },
  ],
  'khai-thac-cho-thue': [
    {
      heading: 'Tìm đúng khách thuê, nhanh và an toàn',
      body: 'Chúng tôi chụp ảnh thật, đăng tin trên website và các kênh phù hợp, dẫn khách xem căn và sàng lọc khách thuê. Căn hộ được giới thiệu đúng tệp khách: chuyên gia, gia đình, khách thuê dài hạn hoặc ngắn hạn.',
    },
    {
      heading: 'Các bước khai thác',
      body: '• Định giá thuê theo thị trường và đặc điểm căn hộ.\n• Chụp ảnh, viết mô tả, đăng tin.\n• Dẫn khách xem căn, thương lượng điều kiện.\n• Soạn hợp đồng, nhận cọc và bàn giao căn hộ.',
    },
    {
      heading: 'Chăm sóc người thuê',
      body: 'Sau khi khách dọn vào, Đất Vàng Group là đầu mối tiếp nhận mọi yêu cầu, giúp khách thuê yên tâm và gắn bó lâu hơn với căn hộ.',
    },
  ],
  'hop-tac-chu-so-huu': [
    {
      heading: 'Ký gửi căn hộ cho thuê hoặc bán',
      body: 'Chủ nhà ký gửi căn hộ để Đất Vàng Group tìm khách thuê hoặc người mua. Chúng tôi khảo sát miễn phí, đề xuất giá và lo toàn bộ quá trình đến khi giao dịch hoàn tất.',
    },
    {
      heading: 'Quyền lợi của chủ nhà',
      body: '• Căn hộ được giới thiệu trên website và hệ thống khách hàng của Đất Vàng Group.\n• Thông tin, chi phí và tiến độ được cập nhật minh bạch.\n• Chỉ phát sinh phí dịch vụ theo thỏa thuận đã ký.',
    },
    {
      heading: 'Bắt đầu thế nào',
      body: 'Để lại thông tin căn hộ qua biểu mẫu hoặc gọi hotline. Chuyên viên sẽ hẹn lịch khảo sát và gửi đề xuất trong vòng 2–3 ngày làm việc.',
    },
  ],
  'tu-van-dau-tu': [
    {
      heading: 'Đầu tư căn hộ dựa trên số liệu thực tế',
      body: 'Chúng tôi cùng bạn xem xét mục tiêu (ở, cho thuê, tích lũy), ngân sách và thời gian nắm giữ, rồi so sánh các dự án theo vị trí, pháp lý, giá và khả năng khai thác cho thuê tại Đà Nẵng.',
    },
    {
      heading: 'Nội dung tư vấn',
      body: '• Phân tích giá bán và giá thuê thực tế theo từng dự án.\n• Ước tính dòng tiền cho thuê và các chi phí sở hữu.\n• Lưu ý pháp lý, tiến độ và rủi ro cần kiểm tra.\n• Phương án khai thác sau khi nhận nhà.',
    },
    {
      heading: 'Lưu ý',
      body: 'Thông tin tư vấn dựa trên dữ liệu thị trường tại thời điểm trao đổi và không phải cam kết lợi nhuận. Quyết định đầu tư cuối cùng thuộc về khách hàng.',
    },
  ],
  'toi-uu-khong-gian': [
    {
      heading: 'Căn hộ đẹp hơn, cho thuê tốt hơn',
      body: 'Một căn hộ được bố trí hợp lý, ánh sáng tốt và nội thất phù hợp sẽ dễ cho thuê hơn và giữ được giá. Chúng tôi tư vấn cải tạo, bổ sung nội thất theo ngân sách của chủ nhà.',
    },
    {
      heading: 'Chúng tôi hỗ trợ',
      body: '• Khảo sát hiện trạng và nhu cầu của tệp khách thuê mục tiêu.\n• Đề xuất bố trí, vật liệu, thiết bị và ngân sách.\n• Phối hợp với đơn vị thi công, nội thất và nghiệm thu.',
    },
    {
      heading: 'Kết quả mong đợi',
      body: 'Không gian sống tiện nghi, bền đẹp, dễ bảo trì, giúp căn hộ nổi bật khi đăng tin và rút ngắn thời gian tìm khách.',
    },
  ],
  'cham-soc-bao-tri': [
    {
      heading: 'Giữ căn hộ luôn trong tình trạng tốt',
      body: 'Đất Vàng Group lên lịch kiểm tra định kỳ, phát hiện sớm hư hỏng và phối hợp sửa chữa, để căn hộ luôn sẵn sàng cho khách thuê và giữ giá trị lâu dài.',
    },
    {
      heading: 'Phạm vi chăm sóc',
      body: '• Kiểm tra điện, nước, điều hòa, thiết bị và nội thất.\n• Vệ sinh, bảo dưỡng định kỳ.\n• Tiếp nhận và xử lý sự cố của khách thuê.\n• Ghi nhận hình ảnh, báo cáo cho chủ nhà.',
    },
    {
      heading: 'Chi phí minh bạch',
      body: 'Mọi hạng mục sửa chữa được báo giá và chủ nhà đồng ý trước khi thực hiện, kèm hình ảnh trước và sau khi xử lý.',
    },
  ],
};

/** Words that mark text still written for the demo site. */
export const DEMO_MARKERS = /\b(demo)\b|minh họa|localStorage|trên trình duyệt|dữ liệu mẫu|bản trình diễn/i;
