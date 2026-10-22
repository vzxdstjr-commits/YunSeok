// 이 파일은 사용자 입력, 저장, 수정, 삭제와 화면 갱신을 연결하는 앱의 중심입니다.
// 즉시 실행 함수 안에 두어 임시 변수들이 브라우저의 전역 이름과 충돌하지 않게 합니다.
(() => {
  // localStorage에 구독 목록을 저장할 때 사용할 고유한 이름입니다.
  const STORAGE_KEY = "sub-tracker-subscriptions";

  // HTML 문서에 미리 만들어 둔 요소를 찾아 변수에 보관합니다.
  // 매번 document 전체에서 찾는 대신 이 변수들을 이벤트 처리에 재사용합니다.
  const form = document.getElementById("subscription-form");
  const formHeading = document.getElementById("form-heading");
  const formMessage = document.getElementById("form-message");
  const idInput = document.getElementById("subscription-id");
  const nameInput = document.getElementById("name");
  const amountInput = document.getElementById("amount");
  const cycleInput = document.getElementById("cycle");
  const dateInput = document.getElementById("next-payment-date");
  const categoryInput = document.getElementById("category");
  const submitButton = document.getElementById("submit-button");
  const cancelEditButton = document.getElementById("cancel-edit-button");
  const list = document.getElementById("subscription-list");

  // 현재 화면에서 사용하는 구독 목록입니다.
  // 화면을 열 때 localStorage에서 읽고, 추가/수정/삭제 후 최신 배열로 교체합니다.
  let subscriptions = [];

  // 현재 컴퓨터의 현지 날짜를 YYYY-MM-DD 형식으로 반환합니다.
  // UTC 날짜를 그대로 쓰면 일부 시간대에서 하루 전 날짜가 될 수 있으므로
  // 현지 시간대 차이를 먼저 보정한 뒤 ISO 문자열을 만듭니다.
  function todayAsISODate() {
    const now = new Date();
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return localDate.toISOString().slice(0, 10);
  }

  // localStorage에 들어 있는 데이터 한 건의 모양이 앱에서 사용할 수 있는지 확인합니다.
  // 잘못된 값이나 오래된 형식이 있으면 앱이 엉뚱한 화면을 그리는 대신 읽기 오류를 알려줍니다.
  function isValidSubscription(subscription) {
    return subscription
      && typeof subscription.id === "string"
      && typeof subscription.name === "string"
      && subscription.name.trim().length > 0
      && Number.isFinite(subscription.amount)
      && subscription.amount > 0
      && (subscription.cycle === "monthly" || subscription.cycle === "yearly")
      && typeof subscription.nextPaymentDate === "string"
      && /^\d{4}-\d{2}-\d{2}$/.test(subscription.nextPaymentDate)
      && typeof subscription.category === "string";
  }

  // 저장소에서 구독 목록을 읽습니다.
  // 처음 방문한 경우에는 아직 저장된 문자열이 없으므로 빈 배열을 반환합니다.
  function readSubscriptions() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === null) {
      return [];
    }

    // localStorage의 값은 문자열이므로 JSON.parse로 JavaScript 배열/객체로 되돌립니다.
    const parsed = JSON.parse(saved);
    // 배열인지, 모든 항목의 필수 정보가 올바른지 확인한 후에만 사용합니다.
    if (!Array.isArray(parsed) || !parsed.every(isValidSubscription)) {
      throw new Error("저장된 구독 데이터의 형식이 올바르지 않습니다.");
    }
    return parsed;
  }

  // 새 목록을 저장소에 기록하고, 메모리의 목록과 화면도 같은 값으로 갱신합니다.
  // 저장에 실패하면 예외가 발생하므로 호출한 쪽에서 사용자에게 오류를 표시할 수 있습니다.
  function saveSubscriptions(nextSubscriptions) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSubscriptions));
    subscriptions = nextSubscriptions;
    render();
  }

  // 모든 화면 표시 함수를 실행합니다.
  // 데이터 변경 후 이 함수 하나를 호출하면 목록, 상단 합계, 카테고리가 함께 업데이트됩니다.
  function render() {
    const today = todayAsISODate();
    SubscriptionUI.renderSubscriptions(subscriptions, today);
    SubscriptionUI.renderSummary(subscriptions);
    SubscriptionUI.renderCategories(subscriptions);
  }

  // 폼 아래의 상태/오류 안내 문구를 교체합니다.
  function showMessage(message) {
    formMessage.textContent = message;
  }

  // 추가나 수정이 끝난 뒤 폼을 처음 상태로 되돌립니다.
  // 기본 날짜는 오늘로 설정하고, 제목과 버튼 글씨도 '구독 추가'로 바꿉니다.
  function resetForm() {
    form.reset();
    idInput.value = "";
    dateInput.value = todayAsISODate();
    formHeading.textContent = "구독 추가";
    submitButton.textContent = "구독 추가";
    cancelEditButton.hidden = true;
    showMessage("");
  }

  // 수정 버튼을 누른 구독 데이터를 폼에 채워 넣습니다.
  // 숨겨진 id에도 구독 식별자를 넣어 저장할 때 새 항목이 아니라 기존 항목을 바꾸게 합니다.
  function startEditing(subscription) {
    idInput.value = subscription.id;
    nameInput.value = subscription.name;
    amountInput.value = subscription.amount;
    cycleInput.value = subscription.cycle;
    dateInput.value = subscription.nextPaymentDate;
    categoryInput.value = subscription.category;
    formHeading.textContent = "구독 수정";
    submitButton.textContent = "변경 저장";
    cancelEditButton.hidden = false;
    showMessage("");
    nameInput.focus();
  }

  // 각 새 구독을 구분하기 위한 식별자를 만듭니다.
  // 시간 값에 임의 문자열을 더해 같은 시각에 여러 항목을 만들어도 겹칠 가능성을 낮춥니다.
  function createId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // 폼의 제출 이벤트는 새 구독 추가와 기존 구독 수정을 모두 처리합니다.
  form.addEventListener("submit", event => {
    // submit 버튼의 기본 동작인 페이지 새로고침을 막습니다.
    event.preventDefault();
    showMessage("");

    // 이름의 앞뒤 공백을 제거하고 금액 입력을 문자열에서 숫자로 변환합니다.
    const name = nameInput.value.trim();
    const amount = Number(amountInput.value);
    // 브라우저의 required/min 검사 외에도 핵심 조건을 JavaScript에서 다시 확인합니다.
    if (!name || !Number.isFinite(amount) || amount <= 0) {
      showMessage("이름과 0보다 큰 결제 금액을 입력해 주세요.");
      return;
    }

    // 수정 중이면 숨겨진 id를 재사용하고, 새 항목이면 새로운 id를 발급합니다.
    const id = idInput.value || createId();
    // 화면과 localStorage에서 같은 구조로 다룰 수 있도록 객체를 만듭니다.
    const updatedSubscription = {
      id,
      name,
      amount,
      cycle: cycleInput.value,
      nextPaymentDate: dateInput.value,
      category: categoryInput.value
    };
    // id가 이미 있으면 같은 항목만 교체한 새 배열을 만들고,
    // id가 없으면 기존 배열 끝에 새 항목을 붙인 새 배열을 만듭니다.
    const nextSubscriptions = idInput.value
      ? subscriptions.map(subscription =>
        subscription.id === id ? updatedSubscription : subscription
      )
      : [...subscriptions, updatedSubscription];

    try {
      // 저장을 먼저 시도합니다. 성공하면 화면을 갱신하고 폼을 초기화합니다.
      saveSubscriptions(nextSubscriptions);
      resetForm();
    } catch (error) {
      // 저장공간 부족이나 브라우저 설정으로 저장이 실패하면 성공한 것처럼 숨기지 않습니다.
      showMessage(`저장하지 못했습니다: ${error.message}`);
    }
  });

  // 목록의 버튼 클릭을 한 곳에서 처리합니다.
  // 카드가 여러 개여도 각 카드마다 이벤트 함수를 붙일 필요가 없는 이벤트 위임 방식입니다.
  list.addEventListener("click", event => {
    // 실제 클릭된 요소 또는 그 부모 중 data-action 버튼을 찾습니다.
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    // 버튼의 data-id와 같은 id를 가진 구독을 현재 목록에서 찾습니다.
    const subscription = subscriptions.find(item => item.id === button.dataset.id);
    if (!subscription) {
      return;
    }

    if (button.dataset.action === "edit") {
      // 수정 버튼이면 선택된 구독 값으로 폼을 채웁니다.
      startEditing(subscription);
      return;
    }

    // 삭제는 실수 방지를 위해 브라우저 확인 창에서 사용자가 동의한 경우에만 진행합니다.
    if (button.dataset.action === "delete"
      && window.confirm(`"${subscription.name}" 구독을 삭제할까요?`)) {
      try {
        // 삭제할 항목을 제외한 새 배열을 저장합니다.
        saveSubscriptions(subscriptions.filter(item => item.id !== subscription.id));
        // 삭제한 항목을 편집 중이었다면 화면의 폼도 초기화합니다.
        if (idInput.value === subscription.id) {
          resetForm();
        }
        showMessage("구독을 삭제했습니다.");
      } catch (error) {
        // 삭제된 화면만 보이고 저장은 안 되는 상황을 막기 위해 오류를 안내합니다.
        showMessage(`삭제하지 못했습니다: ${error.message}`);
      }
    }
  });

  // 취소 버튼은 수정 중이던 변경을 저장하지 않고 폼을 원래 상태로 되돌립니다.
  cancelEditButton.addEventListener("click", resetForm);
  // 새 구독을 입력할 때 결제일 기본값으로 오늘 날짜를 보여줍니다.
  dateInput.value = todayAsISODate();

  try {
    // 페이지가 처음 열릴 때 저장된 목록을 불러와 바로 화면에 표시합니다.
    subscriptions = readSubscriptions();
    render();
  } catch (error) {
    // 저장된 JSON이 손상되었거나 읽기 권한이 없을 때 오류를 화면에 표시합니다.
    // 데이터를 임의로 지우지 않고, 사용자가 원인을 확인할 수 있도록 폼을 비활성화합니다.
    showMessage(`구독 데이터를 불러오지 못했습니다: ${error.message}`);
    form.querySelectorAll("input, select, button").forEach(control => {
      control.disabled = true;
    });
  }
})();
