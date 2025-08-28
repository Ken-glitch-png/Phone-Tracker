# Phone Tracker - Lost Device Recovery System

A comprehensive web application for tracking and recovering lost cellphones using phone numbers, IMEI numbers, or email addresses.

## Features

- **Report Lost Phones**: Users can report their lost devices with detailed information
- **Report Found Phones**: Good Samaritans can report phones they've found
- **Advanced Search**: Search by phone number, IMEI, email, or general keywords
- **Real-time Statistics**: Track total phones reported, found, and returned
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Secure API**: Built with security best practices including rate limiting and data validation
- **SQLite Database**: Lightweight, file-based database for easy deployment

## Technology Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **SQLite3** - Database
- **bcrypt** - Password hashing
- **JWT** - Authentication tokens
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing
- **Express Rate Limit** - API rate limiting
- **Validator** - Data validation

### Frontend
- **HTML5** - Markup
- **CSS3** - Styling with modern features
- **Vanilla JavaScript** - Client-side functionality
- **Font Awesome** - Icons
- **Responsive Design** - Mobile-first approach

## Installation

### Prerequisites
- Node.js (version 14 or higher)
- npm (comes with Node.js)

### Setup Instructions

1. **Clone or download the project**
   ```bash
   cd "Tracking Website for lost gadgets"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-restart:
   ```bash
   npm run dev
   ```

4. **Access the application**
   Open your browser and navigate to: `http://localhost:3000`

## Usage

### Reporting a Lost Phone
1. Navigate to the "Report Lost" section
2. Fill in the required information:
   - Email address (required)
   - Your name (required)
   - Phone details (number, IMEI, brand, model, etc.)
   - Location and date lost
   - Additional description
3. Submit the form

### Reporting a Found Phone
1. Navigate to the "Report Found" section
2. Fill in the available information:
   - Your name and contact (required)
   - Phone details you can identify
   - Where and when you found it
3. Submit the form

### Searching for Phones
1. Go to the "Search" section
2. Enter search terms (phone number, IMEI, email, or keywords)
3. Select search type or use "All Fields" for comprehensive search
4. View results with detailed information

## API Endpoints

### Lost Phones
- `GET /api/lost-phones` - Get all lost phones
- `POST /api/lost-phones` - Report a lost phone
- `PUT /api/lost-phones/:id/status` - Update phone status

### Found Phones
- `GET /api/found-phones` - Get all found phones
- `POST /api/found-phones` - Report a found phone

### Search
- `GET /api/search?query=<term>&type=<type>` - Search phones
  - Types: `all`, `phone`, `imei`, `email`

## Database Schema

### Lost Phones Table
```sql
CREATE TABLE lost_phones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT,
    imei TEXT,
    email TEXT NOT NULL,
    brand TEXT,
    model TEXT,
    color TEXT,
    description TEXT,
    location_lost TEXT,
    date_lost DATE,
    contact_name TEXT NOT NULL,
    contact_phone TEXT,
    status TEXT DEFAULT 'lost',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Found Phones Table
```sql
CREATE TABLE found_phones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number TEXT,
    imei TEXT,
    email TEXT,
    brand TEXT,
    model TEXT,
    color TEXT,
    description TEXT,
    location_found TEXT,
    date_found DATE,
    finder_name TEXT NOT NULL,
    finder_contact TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **Helmet**: Security headers protection
- **Input Validation**: Server-side validation for all inputs
- **CORS**: Configured for secure cross-origin requests
- **SQL Injection Protection**: Parameterized queries
- **XSS Protection**: Input sanitization

## Configuration

### Environment Variables
Create a `.env` file in the root directory:

```env
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
```

### Production Deployment

1. **Set environment variables**:
   - `NODE_ENV=production`
   - `JWT_SECRET=<strong-random-secret>`
   - `PORT=<desired-port>`

2. **Use a process manager** (PM2 recommended):
   ```bash
   npm install -g pm2
   pm2 start server.js --name "phone-tracker"
   ```

3. **Set up reverse proxy** (Nginx recommended)

4. **Enable HTTPS** for production use

## File Structure

```
Tracking Website for lost gadgets/
├── server.js              # Main server file
├── package.json           # Dependencies and scripts
├── README.md             # This file
├── phones.db             # SQLite database (created automatically)
└── public/               # Static files
    ├── index.html        # Main HTML file
    ├── styles.css        # CSS styles
    └── script.js         # Client-side JavaScript
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For support or questions:
- Create an issue in the repository
- Check the documentation
- Review the code comments

## Future Enhancements

- User authentication system
- Email notifications for matches
- SMS integration
- Mobile app
- Advanced filtering options
- Geolocation features
- Image upload for phones
- Admin dashboard
- Analytics and reporting

---

**Note**: This application is designed to help people recover their lost devices. Always verify ownership before returning devices and follow local laws and regulations regarding found property.