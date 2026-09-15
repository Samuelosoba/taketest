import {test,expect} from '@playwright/test';
const login=async(page,role)=>{await page.goto('/login');await page.getByRole('button',{name:role,exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:/Welcome back,|The bigger picture/})).toBeVisible();};
test('administrator can browse the workspace, create a course, and persist login',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await login(page,'Admin');await page.screenshot({path:'test-results/dashboard-desktop.png',fullPage:true});
 await page.reload();await expect(page.getByRole('heading',{name:/Welcome back, Alex/})).toBeVisible();
 for(const [link,heading] of [['Examinations','Make knowledge count.'],['Question bank','Great assessments start here.'],['Courses','A place for every subject.'],['Students','Every learner, in one place.'],['Team members','Good people. Great possibilities.'],['Results & grading','See the progress behind the numbers.'],['Manual grading','Give thoughtful answers their due.'],['Payments','Every transaction, accounted for.'],['Certificates','Achievement deserves recognition.'],['Reports & insights','Turn outcomes into understanding.'],['Settings','Make this workspace yours.']]){
  await page.locator('.sidebar').getByRole('link',{name:link,exact:true}).click();await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();await expect(page.locator('.loading')).toHaveCount(0);
 }
 await page.locator('.sidebar').getByRole('link',{name:'Courses',exact:true}).click();await page.getByRole('button',{name:'Create course'}).click();
 const code=`BROWSER-${Date.now()}`;await page.getByLabel('Course title').fill('Browser verification course');await page.getByLabel('Course code').fill(code);await page.getByLabel('Description',{exact:true}).fill('Created by the automated browser workflow.');await page.getByRole('button',{name:'Save changes'}).click();await expect(page.getByText(code,{exact:true})).toBeVisible();
 // Retain the record as archived so a rerun never destroys user data.
 const card=page.locator('.course-card').filter({hasText:code});await card.getByRole('button',{name:'Edit course'}).click();await page.getByLabel('Status',{exact:true}).selectOption('ARCHIVED');await page.getByRole('button',{name:'Save changes'}).click();
 expect(errors).toEqual([]);
});
test('student completes an exam and sees a server-graded result',async({page})=>{
 // Create a dedicated student through public registration; demo attempts remain untouched.
 await page.goto('/register');await page.getByRole('button',{name:'Student',exact:true}).click();await page.getByLabel('Your full name').fill('Browser Test Student');await page.getByLabel('Institution workspace slug').fill('greenfield');await page.getByLabel('Email address').fill(`browser-${Date.now()}@example.test`);await page.getByLabel('Password',{exact:true}).fill('Assessment123!');await page.getByRole('button',{name:'Create account'}).click();await expect(page.getByRole('heading',{name:/Welcome back/})).toBeVisible();
 await page.locator('.sidebar').getByRole('link',{name:'Examinations',exact:true}).click();const row=page.getByRole('row').filter({hasText:'General Science · Practice Test'});await row.getByRole('button',{name:'View exam'}).click();await page.getByRole('button',{name:'Begin examination'}).click();await expect(page.getByRole('heading',{name:'What is the chemical symbol for water?'})).toBeVisible();await page.getByText('H2O',{exact:true}).click();await expect(page.getByText('All answers saved')).toBeVisible();
 await page.reload();await expect(page.getByRole('heading',{name:'What is the chemical symbol for water?'})).toBeVisible();await expect(page.locator('.answer-options label.selected')).toContainText('H2O');
 await page.getByRole('button',{name:'Review & submit'}).click();await page.getByRole('dialog').getByRole('button',{name:'Submit examination',exact:true}).click();await expect(page.getByRole('heading',{name:'See the progress behind the numbers.'})).toBeVisible();await expect(page.getByText('(100%)')).toBeVisible();await page.getByRole('button',{name:'Issue certificate'}).click();await page.locator('.sidebar').getByRole('link',{name:'Certificates',exact:true}).click();await expect(page.getByRole('button',{name:'Download PDF'})).toBeVisible();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download PDF'}).click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/certificate.*\.pdf/);
 await page.getByRole('link',{name:'Verify',exact:true}).click();await expect(page.getByRole('heading',{name:'Certificate verified.'})).toBeVisible();
});
test('examiner and owner see role-appropriate workspaces',async({page})=>{
 await login(page,'Examiner');await expect(page.locator('.sidebar').getByRole('link',{name:'Students',exact:true})).toHaveCount(0);await page.getByTitle('Sign out').click();await login(page,'Owner');await expect(page.getByRole('heading',{name:'The bigger picture, made clear.'})).toBeVisible();await expect(page.getByRole('cell').filter({hasText:'Greenfield Academy'}).first()).toBeVisible();
});
test('mobile navigation and layout fit the viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page,'Admin');await page.screenshot({path:'test-results/dashboard-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.getByRole('button',{name:'Open navigation'}).click();await page.locator('.sidebar').getByRole('link',{name:'Question bank',exact:true}).click();await expect(page.getByRole('heading',{name:'Great assessments start here.'})).toBeVisible();await page.getByRole('button',{name:'Add question'}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
});
