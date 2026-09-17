import { expect, test, type APIRequestContext } from '@playwright/test';
import { readE2eEnvironment } from '../../scripts/e2e-environment.ts';

const e2e = readE2eEnvironment();

async function signInAdmin(request: APIRequestContext) {
  const response = await request.post('/api/auth/login', {
    data: {
      email: e2e.adminEmail,
      password: e2e.adminPassword,
    },
  });
  expect(response.status()).toBe(200);
}

async function seedProduct(request: APIRequestContext, suffix: string) {
  await signInAdmin(request);
  const categoryName = `E2E Category ${suffix}`;
  const productName = `E2E Product ${suffix}`;
  const categoryResponse = await request.post('/api/admin/categories', {
    data: { name: categoryName },
  });
  expect(categoryResponse.status()).toBe(201);
  const category = (await categoryResponse.json()) as { id: string };
  const productResponse = await request.post('/api/admin/products', {
    data: {
      name: productName,
      description: `E2E description ${suffix}`,
      priceMinor: 2_500,
      categoryId: category.id,
      initialStock: 5,
    },
  });
  expect(productResponse.status()).toBe(201);
  const product = (await productResponse.json()) as { id: string };
  return { categoryName, productName, productId: product.id };
}

test.describe('critical Customer and Admin journeys', () => {
  test('Customer can register, browse, update cart, checkout, view history, update profile, and login again', async ({
    page,
    request,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const { productName } = await seedProduct(request, suffix);
    const email = `customer-${suffix}@example.com`;
    const password = 'e2e-customer-pass';

    await page.goto('/register');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByLabel('Display name (optional)').fill('E2E Customer');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Find your next favorite' })).toBeVisible();

    await page.getByPlaceholder('Search by name or description').fill(productName);
    await page.getByRole('button', { name: 'Search' }).click();
    await page.getByRole('link', { name: productName }).click();
    await expect(page.getByRole('heading', { name: productName })).toBeVisible();
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();

    await page.getByLabel('Qty').fill('2');
    await expect(page.getByLabel('Qty')).toHaveValue('2');
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await page.getByRole('button', { name: 'Place order' }).click();
    await expect(page.getByRole('heading', { name: 'Thank you for your order' })).toBeVisible();
    await page.getByRole('link', { name: 'View order history' }).click();
    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();
    await expect(page.getByText('PLACED')).toBeVisible();

    await page.goto('/profile');
    await page.getByLabel('Display name').fill('E2E Customer Updated');
    await page.getByRole('button', { name: 'Save display name' }).click();
    await expect(page.getByRole('status')).toContainText('Profile saved.');

    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Find your next favorite' })).toBeVisible();
  });

  test('Admin can manage category/product/inventory and advance a real order', async ({
    page,
    browser,
  }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const categoryName = `UI Category ${suffix}`;
    const productName = `UI Product ${suffix}`;
    const updatedCategoryName = `${categoryName} Updated`;
    const updatedProductName = `${productName} Updated`;
    const customerEmail = `admin-flow-${suffix}@example.com`;
    const customerPassword = 'e2e-customer-pass';

    await page.goto('/login');
    await page.getByLabel('Email address').fill(e2e.adminEmail);
    await page.getByLabel('Password').fill(e2e.adminPassword);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Products' })).toBeVisible();

    await page.goto('/admin/categories');
    await page.getByLabel('Category name').fill(categoryName);
    await page.getByRole('button', { name: 'Add category' }).click();
    await expect(page.getByText(categoryName)).toBeVisible();
    const categoryRow = page.locator('.admin-row', { hasText: categoryName });
    await categoryRow.getByRole('button', { name: 'Edit' }).click();
    await page.getByLabel(`Name for ${categoryName}`).fill(updatedCategoryName);
    await categoryRow.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(updatedCategoryName)).toBeVisible();

    await page.goto('/admin/products');
    await page.getByLabel('Name').fill(productName);
    await page.getByLabel('Description').fill(`Description ${suffix}`);
    await page.getByLabel('Price (USD)').fill('25.00');
    await page.getByLabel('Initial stock').fill('5');
    await page.getByLabel('Category').selectOption({ label: updatedCategoryName });
    await page.getByRole('button', { name: 'Create product' }).click();
    await expect(page.getByText(productName)).toBeVisible();
    const productRow = page.locator('.admin-row', { hasText: productName });
    await productRow.getByRole('button', { name: 'Edit' }).click();
    const editProduct = page.locator('form.admin-form', {
      has: page.getByRole('heading', { name: 'Edit product' }),
    });
    await editProduct.getByLabel('Price (USD)').fill('25.001');
    await editProduct.getByRole('button', { name: 'Save changes' }).click();
    await expect(editProduct.getByRole('alert')).toContainText('no more than two decimal places');
    await editProduct.getByLabel('Name').fill(updatedProductName);
    await editProduct.getByLabel('Description').fill(`Updated description ${suffix}`);
    await editProduct.getByLabel('Price (USD)').fill('26.50');
    await editProduct.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText(updatedProductName)).toBeVisible();

    await page.goto('/admin/inventory');
    await page.getByLabel(`Quantity for ${updatedProductName}`).fill('4');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Current 4')).toBeVisible();

    const customerContext = await browser.newContext({ baseURL: 'http://127.0.0.1:4173' });
    const customerPage = await customerContext.newPage();
    await customerPage.goto('/register');
    await customerPage.getByLabel('Email address').fill(customerEmail);
    await customerPage.getByLabel('Password').fill(customerPassword);
    await customerPage.getByRole('button', { name: 'Create account' }).click();
    await customerPage.getByPlaceholder('Search by name or description').fill(updatedProductName);
    await customerPage.getByRole('button', { name: 'Search' }).click();
    await customerPage.getByRole('link', { name: updatedProductName }).click();
    await customerPage.getByRole('button', { name: 'Add to cart' }).click();
    await customerPage.getByRole('button', { name: 'Continue to checkout' }).click();
    await customerPage.getByRole('button', { name: 'Place order' }).click();
    await expect(
      customerPage.getByRole('heading', { name: 'Thank you for your order' }),
    ).toBeVisible();
    await expect(customerPage.getByText('Placed')).toBeVisible();
    await customerContext.close();

    await page.goto('/admin/orders');
    await expect(page.getByText(customerEmail)).toBeVisible();
    const orderRow = page.locator('.admin-row', { hasText: customerEmail });
    await orderRow.getByRole('link', { name: 'View' }).click();
    await expect(page.getByText(customerEmail)).toBeVisible();
    await expect(page.getByText('Placed')).toBeVisible();
    await page.getByRole('button', { name: 'Mark processing' }).click();
    await expect(page.getByText('PROCESSING')).toBeVisible();
    await page.getByRole('button', { name: 'Mark completed' }).click();
    await expect(page.getByText('COMPLETED')).toBeVisible();
  });
});
