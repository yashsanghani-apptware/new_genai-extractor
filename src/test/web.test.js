// NEED TO UPDATE AS CODE IS UPDATED FOR SITEMAP AND EXTRACTOR
// import { scraping } from "../controllers/extractor";

// const body =[
//   {
//       "url": "https://usa.visa.com/",
//       "email": "ab@gmail.com",
//       "password": "a123",
//       "depth": 1
//   },
//   {
//       "url": "https://www.nba.com/suns/ ",
//       "email": "abc@gmail.com",
//       "password": "",
//       "depth": 2
//   }
// ]



// describe('scraping function', () => {
//   test('should return 200 and "Data Found" message if data is present', () => {
//     const req = { body: body };
//     const res = {
//       status: jest.fn().mockReturnThis(),
//       json: jest.fn()
//     };
//     scraping(req, res);

//     expect(res.status).toHaveBeenCalledWith(200);
//   });

//   test('should return 400 and "Data Not Found" message if no data is present', () => {
//     const req = { body: null };
//     const res = {
//       status: jest.fn().mockReturnThis(),
//       json: jest.fn()
//     };

//     scraping(req, res);
//     expect(res.status).toHaveBeenCalledWith(400);
//   });

// });
