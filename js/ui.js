// 이 파일은 화면을 그리는 역할만 맡습니다.
// 구독 데이터를 변경하거나 저장하는 일은 main.js가 담당하고,
// 합계/날짜 계산은 별도로 불러온 logic.js의 함수를 사용합니다.
(() => {
  // 원화 표기 방식은 한 번 만들어 두고 가격을 화면에 표시할 때마다 재사용합니다.
  // 최대 소수 자릿수를 0으로 두어 원 단위 금액만 보여줍니다.
  const currencyFormatter = new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0
  });

  // HTML 문자열 안에 사용자가 입력한 이름이나 카테고리를 넣기 전에 위험한 문자를 바꿉니다.
  // 예를 들어 < 를 &lt;로 바꾸면 입력한 글자가 HTML 태그로 실행되지 않고 문자로 보입니다.
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  // 숫자를 '₩11,900'처럼 한국 원화 형식으로 바꿔 반환합니다.
  function formatCurrency(amount) {
    return currencyFormatter.format(amount);
  }

  // 저장된 구독 전체를 목록 영역에 카드 형태로 다시 그립니다.
  // today는 YYYY-MM-DD 문자열이며, 각 결제일까지 남은 날을 계산하는 데 사용합니다.
  function renderSubscriptions(subscriptions, today) {
    const list = document.getElementById("subscription-list");
    const count = document.getElementById("subscription-count");
    // 원본 배열을 직접 정렬하면 저장 데이터의 순서가 바뀌므로 복사본을 정렬합니다.
    // 날짜가 가까운 구독이 목록의 위쪽에 오도록 문자열 날짜 순으로 비교합니다.
    const sorted = [...subscriptions].sort((first, second) =>
      first.nextPaymentDate.localeCompare(second.nextPaymentDate)
    );

    // 구독 개수는 목록이 비어 있더라도 항상 최신 값으로 갱신합니다.
    count.textContent = `${subscriptions.length}개`;
    if (sorted.length === 0) {
      // 등록된 구독이 없으면 빈 안내 문구를 보여주고 카드 생성은 여기서 끝냅니다.
      list.innerHTML = '<p class="empty-state">아직 등록된 구독이 없어요.<br>오른쪽에서 첫 구독을 추가해 보세요.</p>';
      return;
    }

    // map은 각 구독 데이터를 카드 HTML로 바꾸고, join("")은 카드들을 한 문자열로 합칩니다.
    list.innerHTML = sorted.map(subscription => {
      // 프로젝트 계산 함수로 오늘부터 결제일까지의 일수를 얻습니다.
      const days = getDaysUntilPayment(today, subscription.nextPaymentDate);
      // 결제일이 지났으면 D+숫자, 오늘이면 D-day, 앞으로 남았으면 D-숫자로 표시합니다.
      const dday = days < 0 ? `D+${Math.abs(days)}` : days === 0 ? "D-day" : `D-${days}`;
      const cycleLabel = subscription.cycle === "yearly" ? "연간" : "월간";
      // 서비스 이름의 첫 글자를 카드 아이콘처럼 표시합니다.
      const initial = [...subscription.name][0] || "?";

      // data-action과 data-id를 버튼에 기록해 main.js가 어떤 구독 동작인지 알아낼 수 있습니다.
      // 사용자에게서 온 텍스트는 escapeHTML로 처리한 후 HTML에 삽입합니다.
      return `
        <article class="subscription-card">
          <div class="subscription-main">
            <span class="service-mark" aria-hidden="true">${escapeHTML(initial)}</span>
            <div class="service-details">
              <p class="service-name">${escapeHTML(subscription.name)}</p>
              <p class="service-meta">${escapeHTML(subscription.category)} · ${cycleLabel} 결제</p>
            </div>
          </div>
          <div class="service-payment">
            <p class="service-amount">${formatCurrency(getMonthlyAmount(subscription))}<small>/월</small></p>
            <p class="service-dday${days < 0 ? " is-past" : ""}">${dday}</p>
          </div>
          <div class="card-actions">
            <button class="text-button" type="button" data-action="edit" data-id="${escapeHTML(subscription.id)}">수정</button>
            <button class="text-button text-button-delete" type="button" data-action="delete" data-id="${escapeHTML(subscription.id)}">삭제</button>
          </div>
        </article>`;
    }).join("");
  }

  // 상단의 세 가지 요약 값을 최신 구독 배열을 기준으로 다시 계산해 표시합니다.
  function renderSummary(subscriptions) {
    // 0일부터 7일까지의 결제 예정 건수를 구합니다. logic.js가 지난 날짜는 제외합니다.
    const upcoming = getUpcomingPayments(subscriptions, 7);
    document.getElementById("monthly-total").textContent =
      formatCurrency(getTotalMonthlyAmount(subscriptions));
    document.getElementById("annual-total").textContent =
      formatCurrency(getTotalAnnualAmount(subscriptions));
    document.getElementById("upcoming-total").textContent = `${upcoming.length}건`;
  }

  // 카테고리별 월 환산 금액과 전체에서 차지하는 비율 막대를 그립니다.
  function renderCategories(subscriptions) {
    const container = document.getElementById("category-list");
    // 기존 계산 함수를 재사용해 카테고리별 합계와 전체 합계를 구합니다.
    const amounts = getMonthlyAmountByCategory(subscriptions);
    const total = getTotalMonthlyAmount(subscriptions);
    // 큰 지출 카테고리가 위에 나오도록 금액 내림차순으로 정렬합니다.
    const categories = Object.entries(amounts)
      .sort((first, second) => second[1] - first[1]);

    // 0으로 나누는 상황을 피하고, 처음 사용하는 사람에게 다음 행동을 안내합니다.
    if (categories.length === 0 || total === 0) {
      container.innerHTML = '<p class="category-empty">구독을 추가하면 카테고리별 비중을 보여드려요.</p>';
      return;
    }

    // 각 항목의 금액을 전체 월 지출로 나누어 백분율을 구하고, 그 값을 막대 너비로 사용합니다.
    container.innerHTML = categories.map(([name, amount]) => {
      const percentage = Math.round(amount / total * 100);
      return `
        <div class="category-row">
          <div class="category-labels">
            <span class="category-name">${escapeHTML(name)} <small>${percentage}%</small></span>
            <span class="category-value">${formatCurrency(amount)}</span>
          </div>
          <div class="category-track" aria-label="${escapeHTML(name)} ${percentage}%">
            <div class="category-bar" style="width: ${percentage}%"></div>
          </div>
        </div>`;
    }).join("");
  }

  // 다른 스크립트(main.js)가 화면 표시 함수를 사용할 수 있도록 공개합니다.
  // 즉시 실행 함수 안에 포맷터와 함수들을 감춰 전역 변수 충돌을 줄입니다.
  window.SubscriptionUI = {
    formatCurrency,
    renderSubscriptions,
    renderSummary,
    renderCategories
  };
})();
