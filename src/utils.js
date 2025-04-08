function normalizeTimeStr(time) {
    const [h, m, s] = time.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
  }
  
function extractLectureListFromHTML(html) {
  const container = document.createElement('div');
  container.innerHTML = html;

  const rows = container.querySelectorAll("#contentsList > div > div > div.boardlist > div.tbl-ovx > table > tbody > tr");
  const lectures = [];

  for (const row of rows) {
    const tds = row.querySelectorAll("td");
    if (tds.length < 6) continue;

    const applied = tds[6].innerText.trim();
    if (applied !== "접수완료") continue;

    const url = tds[2].querySelector("a")?.href;
    const title = tds[2].innerText.trim();
    const author = tds[3].innerText.trim();
    if (!url || !title || !author) continue;
    
    const dateHTML = tds[4].innerHTML
      .trim()
      .replace(/&nbsp;/g, "")
      .trim();
    const [dateStr, timeRangeStr] = dateHTML
      .split("<br>")
      .map((str) => str.trim());
    if (!dateStr || !timeRangeStr) continue;

    const isApproved = tds[7].innerText.trim() === "OK";
    
    const isCancelable = tds[9].textContent.trim() === "[취소]";
    const deleteScript = isCancelable ? tds[9].querySelector('a')['href'] : "";
    const applyId = isCancelable ? deleteScript.split("'")[1] : "";
    const lectureId = isCancelable ? deleteScript.split("'")[3] : "";

    lectures.push({ url, title, author, dateStr, timeRangeStr, isApproved, isCancelable, applyId, lectureId });
  }

  return lectures;
}

function extractLectureDetailFromHTML(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  return {
    loc: container
      .querySelector("div.top > div:nth-child(4) > div:nth-child(1) > div.c")
      .innerText.trim(),
    npeople: container
      .querySelector("div.top > div:nth-child(4) > div:nth-child(2) > div.c")
      .innerText.trim(),
  };
}

async function getTotalPages(baseUrl){
  const res = await fetch(baseUrl, { credentials: "include" });
  const html = await res.text();
  const container = document.createElement("div")
  container.innerHTML = html
  const totalStr = container.querySelector(".bbs-total strong.color-blue")?.nextSibling?.textContent
  const total = parseInt(totalStr?.replace(":", "")?.trim()) || 0;
  const totalPages = Math.ceil(total / 10);
  return totalPages;
}

async function getAllLectures() {
  const lectures = [];

  const path = "/sw/mypage/userAnswer/history.do?menuNo=200047";
  const totalPages = await getTotalPages(path)

  for (let page = 1; page <= totalPages; page++) {
    const res = await fetch(path + "&pageIndex=" + page, { credentials: "include" });
    const html = await res.text();
    const pageLectures = extractLectureListFromHTML(html);
    lectures.push(...pageLectures);
  }

  for (let ev of lectures) {
    const datePart = ev.dateStr.split("(")[0].trim(); // "2025-04-10"
    const [startTime, endTime] = ev.timeRangeStr
      .split("~")
      .map((s) => normalizeTimeStr(s.trim())); // "18:30:00"

    ev.startAt = new Date(`${datePart}T${startTime}`);
    ev.endAt = new Date(`${datePart}T${endTime}`);
    ev.timeRangeStr = `${startTime.replace(/:\d{2}$/, "")} ~ ${endTime.replace(
      /:\d{2}$/,
      ""
    )}`;
  }

  lectures.sort((a, b) => a.startAt - b.startAt);
  return lectures;
}

function getMin(timeStr){
  let splitTime = timeStr.split(":");
  return (parseInt(splitTime[0]) * 60) + parseInt(splitTime[1]) 
}

function convertLectureDictionary(lectures){
  let lecturesDictionary = Object()
  for(let i=0;i<lectures.length;i++){
      if(!lecturesDictionary.hasOwnProperty(lectures[i].dateStr)){
        lecturesDictionary[lectures[i].dateStr] = []
      }
      lecturesDictionary[lectures[i].dateStr].push(lectures[i].timeRangeStr)
  }
  
  return lecturesDictionary
}

function convertLectureDictionaryWithoutDate(lectures){
  let lecturesDictionary = Object()
  for(let i=0;i<lectures.length;i++){
    dateStrWithoutDate = lectures[i].dateStr.slice(0, -3)
      if(!lecturesDictionary.hasOwnProperty(dateStrWithoutDate)){
        lecturesDictionary[dateStrWithoutDate] = []
      }
      lecturesDictionary[dateStrWithoutDate].push(lectures[i].timeRangeStr)
  }
  
  return lecturesDictionary
}

function getLectureId(url){
  const params = new URL(url).searchParams;
  const qustnrSn = params.get('qustnrSn');
  return qustnrSn
}

function cancelApply(id, qustnrSn, gubun) {
  if (confirm("선택된 항목의 접수를 취소 하시겠습니까?")) {
    fetch("/sw/mypage/userAnswer/cancel.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        id: id,
        qustnrSn: qustnrSn,
        gubun: gubun
      })
    })
      .then(response => response.json())
      .then(data => {
        alert("접수가 취소되었습니다.");
        location.reload();
      })
      .catch(error => {
        console.error(error);
      });
  }
}