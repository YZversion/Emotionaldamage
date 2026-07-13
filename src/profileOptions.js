/** 星座 / MBTI 选项（含「不清楚」） */

export const ZODIAC_OPTIONS = [
  '不清楚',
  '白羊座', '金牛座', '双子座', '巨蟹座',
  '狮子座', '处女座', '天秤座', '天蝎座',
  '射手座', '摩羯座', '水瓶座', '双鱼座',
];

export const MBTI_OPTIONS = [
  '不清楚',
  'INTJ', 'INTP', 'ENTJ', 'ENTP',
  'INFJ', 'INFP', 'ENFJ', 'ENFP',
  'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
  'ISTP', 'ISFP', 'ESTP', 'ESFP',
];

export function fillSelect(selectEl, options, selected = '') {
  if (!selectEl) return;
  selectEl.replaceChildren();
  for (const value of options) {
    const opt = document.createElement('option');
    opt.value = value;
    opt.textContent = value;
    if (value === selected) opt.selected = true;
    selectEl.appendChild(opt);
  }
}
