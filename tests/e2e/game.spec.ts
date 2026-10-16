import { expect, test } from '@playwright/test';

test('مباراة كاملة: المقدم وجوال فريق وضربة وسرية الحصون', async ({ browser }) => {
  const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
  const host = await hostCtx.newPage();
  host.on('dialog', (d) => d.accept());
  await host.goto('/host');
  await host.getByTestId('to-setup').click();
  const room = (await host.getByTestId('room-code').textContent())!.trim();
  const join = (await host.getByTestId('join-code').first().textContent())!.trim();

  // الجوال يوزّع الحصن سرًّا
  const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
  const phone = await phoneCtx.newPage();
  await phone.goto(`/play?room=${room}&code=${join}`);
  await phone.getByRole('button', { name: 'عشوائي' }).click();
  await phone.getByTestId('save-layout').click();
  await expect(phone.getByText('حصنكم جاهز!')).toBeVisible();
  await expect(host.getByText('✅ الحصن جاهز').first()).toBeVisible();

  // رمز خاطئ يُرفض
  const bad = await phone.evaluate(async (r) => (await fetch(`/api/rooms/${r}`, { headers: { 'x-room-key': 'ZZZZZZ' } })).status, room);
  expect(bad).toBe(403);

  await host.getByTestId('start').click();
  await host.getByTestId('random-question').click();
  const q = await host.getByTestId('question-text').textContent();
  await expect(phone.getByTestId('phone-question')).toHaveText(q!);

  // الفريق يجيب صح ويضرب من الجوال
  await host.getByTestId('judge-team').first().click();
  await expect(phone.getByText('اختاروا الخصم ثم الخانة')).toBeVisible();
  const box = (await phone.getByTestId('battlefield').boundingBox())!;
  await expect(async () => {
    await phone.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(phone.getByTestId('fire')).toBeVisible({ timeout: 1000 });
  }).toPass();
  await phone.getByTestId('fire').click();
  await expect(host.getByTestId('strike-reveal')).toBeVisible({ timeout: 5000 });

  // السرية: الجوال لا يرى من حصن الخصم إلا الخانة المضروبة
  const view = await phone.evaluate(async ([r, k]) => (await fetch(`/api/rooms/${r}`, { headers: { 'x-room-key': k } })).json(), [room, join]);
  const opp = view.state.teams.find((t: { id: string }) => t.id !== view.me.teamId);
  expect(opp.layout.filter(Boolean)).toHaveLength(1);
  expect(view.state.teams.some((t: { joinCode?: string }) => t.joinCode)).toBe(false);

  // الفريق لا يستطيع إنهاء اللعبة
  const forbidden = await phone.evaluate(async ([r, k]) => (await fetch(`/api/rooms/${r}/action`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-room-key': k }, body: JSON.stringify({ action: { type: 'end' } }) })).status, [room, join]);
  expect(forbidden).toBe(400);
});

test('وضع الشاشة الواحدة يعمل بلا خادم غرف', async ({ page }) => {
  await page.goto('/host?local=1');
  await page.getByTestId('to-setup').click();
  await page.getByTestId('start').click();
  await page.getByTestId('random-question').click();
  await page.getByRole('button', { name: 'لا أحد' }).click();
  await page.getByTestId('next-turn').click();
  await expect(page.getByText('سؤال لفريق')).toBeVisible();
});
