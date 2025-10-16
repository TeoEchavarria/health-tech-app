from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from typing import Optional
import os, json
from pyfcm import FCMNotification
from config import settings
import pymongo
from bson.objectid import ObjectId
from bson.errors import *

mongo = pymongo.MongoClient(settings.MONGO_URI)

from argon2 import PasswordHasher
ph = PasswordHasher()

import secrets, datetime

router = APIRouter()

# Pydantic Models
class LoginRequest(BaseModel):
    username: str
    password: str
    fcmToken: Optional[str] = None

class RefreshRequest(BaseModel):
    refresh: str

class TokenResponse(BaseModel):
    token: str
    refresh: str
    expiry: str

class SuccessResponse(BaseModel):
    success: bool

# Auth dependency
def verify_token(authorization: Optional[str] = Header(None)) -> str:
    # In DEV mode, skip authorization and return a default test user
    if settings.APP_DEBUG:
        db = mongo[settings.MONGO_DB]
        usrStore = db['users']
        
        # Try to find the first user, or create a test user if none exists
        test_user = usrStore.find_one()
        if test_user:
            print(f"[DEV MODE] Using test user: {test_user['_id']}")
            return test_user['_id']
        
        # Create a test user if no users exist
        test_user_id = 'dev-test-user'
        usrStore.insert_one({
            '_id': test_user_id,
            'username': 'dev-test-user',
            'password': ph.hash('dev'),
            'families': []
        })
        print(f"[DEV MODE] Created and using test user: {test_user_id}")
        return test_user_id
    
    # Production mode - require valid authorization
    if not authorization:
        raise HTTPException(status_code=400, detail='no token provided')
    
    try:
        token = authorization.split(' ')[1]
    except IndexError:
        raise HTTPException(status_code=400, detail='invalid authorization header format')

    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    user = usrStore.find_one({'token': token})

    if not user:
        raise HTTPException(status_code=403, detail='invalid token')
    
    if datetime.datetime.now() > user['expiry']:
        raise HTTPException(status_code=403, detail='token expired. Use /login to reauthenticate.')
    
    return user['_id']

@router.post("/login", response_model=TokenResponse, status_code=201)
def login(request: LoginRequest): 
    username = request.username
    password = request.password
    fcmToken = request.fcmToken

    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    user = usrStore.find_one({'username': username})

    if not user:
        user = usrStore.insert_one({'username': username, 'password': ph.hash(password)}).inserted_id
        usrStore.insert_one({'_id': str(user), 'username': username, 'password': ph.hash(password)})
        usrStore.delete_one({'_id': ObjectId(user)})

        token = secrets.token_urlsafe(32)
        refresh = secrets.token_urlsafe(32)
        expiryDate = datetime.datetime.now() + datetime.timedelta(hours=12)
        usrStore.update_one({'_id': str(user)}, {"$set": {'token': token, 'refresh': refresh, 'expiry': expiryDate}})

        return TokenResponse(
            token=token,
            refresh=refresh,
            expiry=expiryDate.isoformat()
        )
    
    try:
        ph.verify(user['password'], password)
    except Exception: 
        raise HTTPException(status_code=403, detail='invalid password')
   
    if fcmToken:
        try:
            usrStore.update_one({'username': username}, {"$set": {'fcmToken': fcmToken}})
        except Exception:
            raise HTTPException(status_code=500, detail='failed to update fcm token')
        
    sessid = user['_id']

    if "expiry" not in user or datetime.datetime.now() > user['expiry']:
        token = secrets.token_urlsafe(32)
        refresh = secrets.token_urlsafe(32)
        expiryDate = datetime.datetime.now() + datetime.timedelta(hours=12)
        usrStore.update_one({'_id': sessid}, {"$set": {'token': token, 'refresh': refresh, 'expiry': expiryDate}})

    else:
        token = user['token']
        refresh = user['refresh']
        expiryDate = user['expiry']

    return TokenResponse(
        token=token,
        refresh=refresh,
        expiry=expiryDate.isoformat()
    )


@router.post("/refresh", response_model=TokenResponse)
def refresh(request: RefreshRequest):
    refresh_token = request.refresh

    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    user = usrStore.find_one({'refresh': refresh_token})

    if not user:
        raise HTTPException(status_code=403, detail='invalid refresh token')
    
    token = secrets.token_urlsafe(32)
    # refresh = secrets.token_urlsafe(32) # disable refresh token rotation- design flaw, see #35
    expiryDate = datetime.datetime.now() + datetime.timedelta(hours=12)
    usrStore.update_one({'_id': user['_id']}, {"$set": {'token': token, 'refresh': refresh_token, 'expiry': expiryDate}})

    return TokenResponse(
        token=token,
        refresh=refresh_token,
        expiry=expiryDate.isoformat()
    )

@router.delete("/revoke", response_model=SuccessResponse)
def revoke(user_id: str = Depends(verify_token)):
    db = mongo[settings.MONGO_DB]
    usrStore = db['users']

    user = usrStore.find_one({'_id': user_id})

    if not user:
        raise HTTPException(status_code=403, detail='invalid token')
    
    usrStore.update_one({'_id': user['_id']}, {"$unset": {'token': 1, 'refresh': 1, 'expiry': 1}})

    return SuccessResponse(success=True)
